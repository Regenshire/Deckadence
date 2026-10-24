"""Explicit package setup for shared frame/text detection, using its own runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))


def verify(models, progress_path=None):
    """Inspect shared weights locally, without calling their download helpers."""
    from plugin import MODEL_SHA256
    from frame_detection import MODELS
    expected=(('isnet-general-use.onnx', MODEL_SHA256), *MODELS)
    issues={};files=[];done=0;checked=0;hashed=0;last=0.
    total=sum((models/name).stat().st_size for name,_ in expected if (models/name).is_file())
    def report(name, force=False):
        nonlocal last
        if not progress_path or (not force and time.monotonic()-last<.25):return
        last=time.monotonic();path=Path(progress_path);temporary=path.with_suffix('.tmp')
        value=dict(component='Frame and text detection',filename=name,bytes=dict(done=done,total=total),files=dict(done=checked,total=4))
        try:
            temporary.write_text(json.dumps(value),encoding='utf-8');temporary.replace(path)
        except OSError:pass
    for name,checksum in expected:
        path=models/name
        try:
            value=hashlib.sha256()
            with path.open('rb') as source:
                while block:=source.read(8*1024*1024):
                    value.update(block);done+=len(block);report(name)
            hashed+=1
            if value.hexdigest()!=checksum:issues[name]='Downloaded-file checksum mismatch'
            files.append(dict(name=name,sha256=checksum,bytes=path.stat().st_size))
        except OSError:issues[name]='Missing or unreadable detection model'
        checked+=1;report(name,True)
    try:
        from rapidocr_onnxruntime import RapidOCR
        RapidOCR(intra_op_num_threads=2, inter_op_num_threads=2)
    except Exception:
        issues['ocr']='The local text detector could not load. Resume setup to repair its installed model files.'
    checked+=1;report('Local text detector',True)
    return dict(ok=not issues,files_checked=len(expected),checksums_checked=hashed,health_checks=1,bytes_checked=done,issues=issues,
                receipt=dict(version=1,files=files,ocr='rapidocr-onnxruntime==1.4.4'))


def prepare(models):
    os.environ['DECKADENCE_SUBJECT_MODELS'] = str(models)
    from plugin import model_file, MODEL_SHA256
    from frame_detection import MODELS
    from rapidocr_onnxruntime import RapidOCR
    import onnxruntime as ort
    files = []
    for name, checksum in (('isnet-general-use.onnx', MODEL_SHA256), *MODELS):
        path = model_file(name, checksum)
        files.append(dict(name=name, sha256=checksum, bytes=path.stat().st_size))
    # OCR weights ship inside the pinned RapidOCR wheel. Constructing the
    # engine verifies those local weights before declaring a package ready.
    RapidOCR(intra_op_num_threads=2, inter_op_num_threads=2)
    options=ort.SessionOptions();options.intra_op_num_threads=2
    for name, _ in MODELS:
        ort.InferenceSession(str(models/name),sess_options=options,providers=['CPUExecutionProvider'])
    receipt=dict(version=1,files=files,ocr='rapidocr-onnxruntime==1.4.4')
    target=models/'generation-ready.json';temporary=target.with_suffix('.tmp')
    temporary.write_text(json.dumps(receipt),encoding='utf-8');temporary.replace(target)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--models',required=True)
    parser.add_argument('--verify-output');parser.add_argument('--progress-path');args=parser.parse_args()
    if args.verify_output:
        Path(args.verify_output).write_text(json.dumps(verify(Path(args.models),args.progress_path)),encoding='utf-8')
    else:prepare(Path(args.models))
