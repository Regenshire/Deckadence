"""Processor selection shared by image generation and artwork analysis."""


def hardware_device(hardware):
    import torch
    if hardware == 'cpu':
        return 'cpu'
    if hardware == 'mps':
        if not torch.backends.mps.is_available():
            raise RuntimeError('Apple GPU acceleration is unavailable. Use an Apple Silicon Mac with macOS 14 or newer, or choose CPU.')
        device = 'mps'
    elif hardware in ('nvidia', 'amd'):
        if not torch.cuda.is_available():
            raise RuntimeError('The selected GPU runtime cannot access a compatible GPU. Check its driver or choose CPU.')
        hip = bool(torch.version.hip)
        if hardware == 'amd' and not hip:
            raise RuntimeError('This runtime is not using AMD ROCm.')
        if hardware == 'nvidia' and (hip or not torch.version.cuda):
            raise RuntimeError('This runtime is not using NVIDIA CUDA.')
        if hardware == 'nvidia' and torch.cuda.get_device_capability()[0] < 8:
            raise RuntimeError('The shared artwork analyzer requires native BF16 support, such as NVIDIA RTX 30-series or newer.')
        device = 'cuda'
    else:
        raise ValueError('Choose a supported processor.')
    # Test both precisions used by the image models and shared analyzer.
    for dtype in (torch.float16, torch.bfloat16):
        value = (torch.ones((16, 16), device=device, dtype=dtype) @
                 torch.ones((16, 16), device=device, dtype=dtype)).sum().item()
        if value != 4096:
            raise RuntimeError('The selected GPU failed its precision check. Update the operating system or GPU driver, or choose CPU.')
    return device


def mps_available_memory(torch):
    """Respect Metal's working-set limit without disabling its memory guard."""
    return max(0, torch.mps.recommended_max_memory() - torch.mps.driver_allocated_memory())


def empty_device_cache(torch, device):
    if device == 'mps' and torch.backends.mps.is_available():
        torch.mps.empty_cache()
    elif device == 'cuda' and torch.cuda.is_available():
        torch.cuda.empty_cache()
