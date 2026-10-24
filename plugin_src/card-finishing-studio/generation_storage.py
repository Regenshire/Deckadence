"""Local model verification and selective repair; no model inference imports."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re


class GenerationStorageError(RuntimeError):
    pass


def relative_file(value):
    if not isinstance(value,str) or any(character in value for character in '\\:*?[]'):
        raise GenerationStorageError('Invalid model file name.')
    path=PurePosixPath(value)
    if path.is_absolute() or not path.parts or any(part in ('.','..') or part.startswith('.') for part in path.parts):
        raise GenerationStorageError('Invalid model file name.')
    return str(path)


def verify_snapshot(folder, required=(), progress=None, checksums=True, expected_checksums=None):
    """Check JSON, tensor containers, shard references and stored Hub checksums.

    Stored download metadata detects accidental damage. It is not a new trust
    root or a signature: repository identity remains pinned by the catalog.
    """
    from safetensors import safe_open
    folder=Path(folder).resolve();issues={};checked=0;hashed=0
    def report(*counts):
        if progress:
            try:progress(*counts)
            except OSError:pass  # A locked progress file is not a damaged model.
    required=set(required)|set(expected_checksums or ())
    metadata_root=folder/'.cache/huggingface/download'
    if metadata_root.is_dir() and metadata_root.resolve().is_relative_to(folder):
        # Include previously downloaded non-weight assets: a missing tokenizer
        # template is just as fatal as a missing tensor shard.
        for metadata in metadata_root.rglob('*.metadata'):
            if not metadata.resolve().is_relative_to(metadata_root.resolve()):continue
            name=metadata.relative_to(metadata_root).as_posix()[:-len('.metadata')]
            if Path(name).suffix in ('.json','.safetensors','.txt','.model','.jinja'):
                required.add(relative_file(name))
    for name in required:
        name=relative_file(name)
        if not (folder/name).is_file():issues[name]='Missing required file'
    files=sorted(path for path in folder.rglob('*') if path.is_file() and path.suffix in ('.json','.safetensors','.txt','.model','.jinja')
                 and '.cache' not in path.relative_to(folder).parts and path.name not in ('ready.json','repair.json','verification.json'))
    total=sum(path.stat().st_size for path in files);done=0
    for path in files:
        name=path.relative_to(folder).as_posix()
        if not path.resolve().is_relative_to(folder):
            issues[name]='File resolves outside the model directory';continue
        try:
            if not path.stat().st_size:raise ValueError('Empty file')
            if path.suffix=='.json':
                value=json.loads(path.read_text(encoding='utf-8'))
                if not isinstance(value,(dict,list)):raise ValueError('Invalid JSON document')
                if path.name.endswith('.index.json'):
                    mapping=value.get('weight_map')
                    if not isinstance(mapping,dict) or not mapping:raise ValueError('Missing tensor shard index')
                    for shard in set(mapping.values()):
                        shard=relative_file(shard)
                        if not (path.parent/shard).is_file():issues[(path.parent/shard).relative_to(folder).as_posix()]='Missing tensor shard'
            elif path.suffix=='.safetensors':
                with safe_open(str(path),framework='numpy') as container:
                    if not container.keys():raise ValueError('Empty tensor container')
            metadata=folder/'.cache/huggingface/download'/(name+'.metadata')
            expected=(expected_checksums or {}).get(name,'') if checksums else ''
            if not expected and checksums and metadata.is_file() and metadata.resolve().is_relative_to(folder):
                lines=metadata.read_text(encoding='utf-8').splitlines()
                if len(lines)>1:expected=lines[1].strip()
            if re.fullmatch(r'[a-f0-9]{64}|[a-f0-9]{40}',expected):
                digest=hashlib.sha256() if len(expected)==64 else hashlib.sha1(b'blob '+str(path.stat().st_size).encode()+b'\0')
                file_done=0
                with path.open('rb') as stream:
                    while block:=stream.read(8*1024*1024):
                        digest.update(block);file_done+=len(block)
                        report(name,done+file_done,total,checked,len(files))
                hashed+=1
                if digest.hexdigest()!=expected:raise ValueError('Downloaded-file checksum mismatch')
        except (OSError,ValueError,TypeError,KeyError,AttributeError,GenerationStorageError) as exc:
            issues[name]=str(exc)[:200]
        except Exception as exc:
            # Safetensors' Rust exception is not a ValueError.
            if type(exc).__name__!='SafetensorError':raise
            issues[name]='Invalid or incomplete tensor container'
        done+=path.stat().st_size;checked+=1
        report(name,done,total,checked,len(files))
    return dict(ok=not issues,files_checked=checked,checksums_checked=hashed,bytes_checked=done,issues=issues)


def download_snapshot(repository, revision, destination, patterns, progress_class, required=()):
    """Reuse healthy files; redownload only files marked bad by verification."""
    from huggingface_hub import snapshot_download
    destination=Path(destination);repair=destination/'repair.json'
    options=dict(repo_id=repository,revision=revision,local_dir=str(destination),token=False,tqdm_class=progress_class)
    if repair.is_file():
        try:
            data=json.loads(repair.read_text(encoding='utf-8'))
            names=[relative_file(name) for name in data['files']]
            if len(names)>2000:raise ValueError('Too many repair files')
        except (ValueError,TypeError,KeyError) as exc:
            raise GenerationStorageError('The model repair record is invalid. Verify package files again.') from exc
        if names:snapshot_download(**options,allow_patterns=names,force_download=True)
    snapshot_download(**options,allow_patterns=patterns)
    result=verify_snapshot(destination,required=required,checksums=False)
    if not result['ok']:
        repair.write_text(json.dumps({'files':list(result['issues'])}),encoding='utf-8')
        raise GenerationStorageError('Downloaded model files did not pass verification. Resume setup to repair them.')
    repair.unlink(missing_ok=True)
    (destination/'ready.json').write_text(json.dumps({'revision':revision}),encoding='utf-8')
