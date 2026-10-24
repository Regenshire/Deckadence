"""Reuse loaded image weights within one cancellable generation session."""
import gc
from pathlib import Path
import time


class GenerationRuntime:
    def __init__(self):
        self.pipe = None
        self.key = None
        self.adapter = None
        self.placement = None
        self.loads = 0

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
        self.pipe = None
        self.key = self.adapter = self.placement = None
        gc.collect()
        if device == 'cuda':
            torch.cuda.empty_cache()
        started = time.monotonic()
        self.pipe = cls.from_pretrained(model_path, torch_dtype=dtype,
                                       local_files_only=True, use_safetensors=True, **options)
        self.key = key
        self.loads += 1
        print(f'IMAGE_MODEL_LOAD seconds={time.monotonic()-started:.3f} count={self.loads}', flush=True)
        return self.pipe

    def configure(self, device, progress):
        """Use available VRAM instead of always offloading a high-memory GPU."""
        import torch
        if self.placement is not None:
            return
        started = time.monotonic()
        if device == 'cpu':
            self.pipe.to('cpu')
            self.placement = 'cpu'
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
