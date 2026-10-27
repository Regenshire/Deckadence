"""Reuse loaded image weights within one cancellable generation session."""
import gc
from pathlib import Path
import time
from prompter.hardware import empty_device_cache, mps_available_memory


class GenerationRuntime:
    def __init__(self):
        self.pipe = None
        self.key = None
        self.adapter = None
        self.placement = None
        self.loads = 0

    def clear(self):
        """Release the image model before loading an artwork analyzer."""
        if self.pipe is None:
            return
        import torch
        device = self.key[2] if self.key else self.placement
        self.pipe = self.key = self.adapter = self.placement = None
        gc.collect()
        empty_device_cache(torch, device)

    def pipeline(self, cls, model_path, dtype, device, options, progress):
        import torch
        key = (str(Path(model_path).resolve()), str(dtype), device)
        if self.pipe is not None and self.key == key:
            progress('loading', 'Reusing the image model already loaded for this render.')
            if type(self.pipe) is not cls:
                # FLUX's theme and outpaint pipelines share the same weights.
                # Hooks belong to pipeline execution order, so rebuild them.
                self.pipe.remove_all_hooks()
                self.pipe = cls.from_pipe(self.pipe, torch_dtype=dtype)
                self.placement = None
            return self.pipe
        self.clear()
        # The preceding analyzer can leave allocator cache without a pipeline.
        empty_device_cache(torch, device)
        started = time.monotonic()
        loading = self.loading_options(cls, model_path, dtype, options, progress)
        self.pipe = cls.from_pretrained(model_path, torch_dtype=dtype,
                                       local_files_only=True, use_safetensors=True, **loading)
        self.key = key
        self.loads += 1
        print(f'IMAGE_MODEL_LOAD seconds={time.monotonic()-started:.3f} count={self.loads}', flush=True)
        return self.pipe

    @staticmethod
    def loading_options(cls, model_path, dtype, options, progress):
        """Avoid scattered disk reads when RAM can hold the complete checkpoint."""
        folder = Path(model_path)
        weight_bytes = sum(path.stat().st_size for path in folder.rglob('*.safetensors')
                           if '.cache' not in path.relative_to(folder).parts)
        loading = dict(options)
        if not weight_bytes:
            return loading
        import psutil
        # Eager loading temporarily holds serialized bytes and decoded tensors.
        # Leave room for dtype conversion and other apps; low-RAM PCs keep mmap.
        if psutil.virtual_memory().available < 3 * weight_bytes + 4 * 1024**3:
            return loading
        progress('loading', 'Reading model weights into system memory.')
        loading['disable_mmap'] = True
        # Diffusers forwards disable_mmap to its models, but not to Transformers.
        # Supply eager text encoders explicitly so both loaders read sequentially,
        # and the pipeline uses these instances rather than loading them again.
        import transformers
        for name, component in cls.load_config(model_path).items():
            if (name.startswith('text_encoder') and name not in loading
                    and isinstance(component, (list, tuple)) and len(component) == 2
                    and component[0] == 'transformers' and component[1]):
                encoder = getattr(transformers, component[1])
                loading[name] = encoder.from_pretrained(folder / name, dtype=dtype,
                    local_files_only=True, use_safetensors=True, disable_mmap=True)
        print(f'IMAGE_MODEL_READ mode=sequential bytes={weight_bytes}', flush=True)
        return loading

    def configure(self, device, progress):
        """Use available VRAM instead of always offloading a high-memory GPU."""
        import torch
        if self.placement is not None:
            return
        started = time.monotonic()
        if device == 'cpu':
            self.pipe.to('cpu')
            self.placement = 'cpu'
        elif device == 'mps':
            # Unified memory still has a separate Metal working-set limit.
            # Keep activation headroom and offload components when needed.
            seen = set()
            weight_bytes = 0
            for component in self.pipe.components.values():
                if not isinstance(component, torch.nn.Module):
                    continue
                for tensor in (*component.parameters(), *component.buffers()):
                    storage = tensor.untyped_storage()
                    identity = (str(tensor.device), storage.data_ptr())
                    if identity not in seen and tensor.device.type != 'mps':
                        weight_bytes += storage.nbytes()
                    seen.add(identity)
            free = mps_available_memory(torch)
            reserve = max(1024**3, min(4 * 1024**3, free // 4))
            self.pipe.enable_attention_slicing()
            if weight_bytes + reserve <= free:
                progress('loading', 'Moving the image model into Apple GPU memory.')
                try:
                    self.pipe.to('mps')
                    self.placement = 'mps'
                except RuntimeError as exc:
                    if 'out of memory' not in str(exc).lower():
                        raise
                    self.pipe.to('cpu')
                    empty_device_cache(torch, 'mps')
            if self.placement is None:
                progress('loading', 'Preparing Apple GPU generation with model components shared with system memory.')
                self.pipe.enable_model_cpu_offload(device='mps')
                self.placement = 'mps-offload'
        else:
            # Count unique model storage, including components already on GPU.
            seen = set()
            cpu_bytes = 0
            for component in self.pipe.components.values():
                if not isinstance(component, torch.nn.Module):
                    continue
                for tensor in (*component.parameters(), *component.buffers()):
                    storage = tensor.untyped_storage()
                    identity = (str(tensor.device), storage.data_ptr())
                    if identity not in seen and tensor.device.type != 'cuda':
                        cpu_bytes += storage.nbytes()
                    seen.add(identity)
            free, _ = torch.cuda.mem_get_info()
            reserve = 8 * 1024**3  # Prompt/image activations and VAE decoding.
            if cpu_bytes + reserve <= free:
                progress('loading', 'Moving the image model into GPU memory for this render.')
                try:
                    self.pipe.to(device)
                    self.placement = 'gpu'
                except torch.cuda.OutOfMemoryError:
                    # Another application can consume VRAM after the budget check.
                    self.pipe.to('cpu')
                    torch.cuda.empty_cache()
            if self.placement is None:
                progress('loading', 'Preparing GPU generation with model weights shared with system RAM.')
                self.pipe.enable_model_cpu_offload()
                self.placement = 'offload'
        print(f'IMAGE_MODEL_PLACEMENT mode={self.placement} seconds={time.monotonic()-started:.3f}', flush=True)

    def outpaint_adapter(self, path, scale):
        key = str(Path(path).resolve())
        if self.adapter != key:
            self.pipe.load_lora_weights(path, adapter_name='outpaint')
            self.adapter = key
        self.pipe.enable_lora()
        self.pipe.set_adapters('outpaint', adapter_weights=scale)

    def disable_adapter(self):
        if self.adapter is not None:
            self.pipe.disable_lora()
