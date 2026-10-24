"""ICC-managed process artwork; named spot colorants are left untouched."""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
import hashlib
import re
from PIL import Image, ImageCms
from paths import DATA_ROOT_DIR

PROFILE_DIR = Path(DATA_ROOT_DIR) / "icc_profiles"
MAX_PROFILE_BYTES = 16 * 1024 * 1024

def validate_profile(data):
    if not data or len(data) > MAX_PROFILE_BYTES:
        raise ValueError("Choose an ICC profile smaller than 16 MB.")
    try:
        profile = ImageCms.ImageCmsProfile(BytesIO(data))
        if profile.profile.xcolor_space.strip() != "CMYK" or profile.profile.device_class.strip() != "prtr":
            raise ValueError("Choose a CMYK printer/output ICC profile.")
        ImageCms.buildTransform(ImageCms.createProfile("sRGB"), profile, "RGB", "CMYK", renderingIntent=1, flags=0x2000)
        return ImageCms.getProfileDescription(profile).strip()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("This file is not a usable CMYK output ICC profile.") from exc

def profile_bytes(name):
    if not isinstance(name, str) or not name or Path(name).name != name or "/" in name or "\\" in name or Path(name).suffix.lower() not in (".icc", ".icm"):
        raise ValueError("Choose a CMYK ICC profile in Studio Settings before exporting foil or gloss.")
    path = PROFILE_DIR / name
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_PROFILE_BYTES:
        raise ValueError("The selected CMYK ICC profile is missing or invalid. Choose it again in Studio Settings.")
    data = path.read_bytes()
    validate_profile(data)
    return data

def list_profiles():
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    profiles=[]
    for path in sorted(PROFILE_DIR.iterdir(), key=lambda p:p.name.lower()):
        if path.suffix.lower() not in (".icc", ".icm"): continue
        try: label=validate_profile(profile_bytes(path.name))
        except (ValueError, OSError): continue
        profiles.append({"id":path.name,"label":label or path.stem})
    return profiles

def upload_profile(filename, data):
    validate_profile(data)
    stem=re.sub(r"[^a-zA-Z0-9 _.-]", "_", Path(filename.replace("\\","/")).name.rsplit(".",1)[0]).strip(" .")[:90] or "CMYK"
    name=stem+"-"+hashlib.sha256(data).hexdigest()[:12]+".icc"
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    path=PROFILE_DIR/name
    if path.is_symlink(): raise ValueError("This profile filename is unavailable.")
    try:
        with path.open("xb") as output: output.write(data)
    except FileExistsError:
        if path.read_bytes()!=data: raise ValueError("This profile filename is already in use.")
    return name

@lru_cache(maxsize=8)
def transform(data):
    return ImageCms.buildTransform(ImageCms.createProfile("sRGB"), ImageCms.ImageCmsProfile(BytesIO(data)), "RGB", "CMYK", renderingIntent=1, flags=0x2000)

def convert_pdf_artwork(writer, profile_data=None):
    from pypdf.generic import ArrayObject, ContentStream, DecodedStreamObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject
    conversion=transform(profile_data) if profile_data else None
    def convert(image):
        return ImageCms.applyTransform(image, conversion) if conversion else image.convert("CMYK")
    seen=set(); colors={}
    def content(stream):
        parsed=ContentStream(stream,writer)
        for operands,operator in parsed.operations:
            if operator in (b"rg",b"RG"):
                rgb=tuple(max(0,min(255,round(float(v)*255))) for v in operands)
                if rgb not in colors: colors[rgb]=convert(Image.new("RGB",(1,1),rgb)).getpixel((0,0))
                operands[:]=[FloatObject(v/255) for v in colors[rgb]]
        parsed.operations=[(args,b"k" if op==b"rg" else b"K" if op==b"RG" else op) for args,op in parsed.operations]
        return parsed
    def resources(res):
        res=res.get_object()
        for reference in res.get("/XObject",{}).values():
            obj=reference.get_object()
            if id(obj) in seen: continue
            seen.add(id(obj))
            if obj.get("/Subtype")=="/Form":
                if obj.get("/Resources"): resources(obj["/Resources"])
                parsed=content(obj)
                obj.pop(NameObject("/Filter"),None);obj.pop(NameObject("/DecodeParms"),None)
                obj._data=parsed.get_data()
                if hasattr(obj,"decoded_self"): obj.decoded_self=None
            elif obj.get("/Subtype")=="/Image" and obj.get("/ColorSpace")=="/DeviceRGB":
                # pypdf handles JPEG and Flate decoding without resampling.
                data=obj.get_data()
                try:
                    image=Image.open(BytesIO(data));image.load()
                except (OSError,ValueError):
                    if obj.get("/BitsPerComponent",8)!=8: raise ValueError("Unsupported artwork bit depth for CMYK conversion.")
                    image=Image.frombytes("RGB",(obj["/Width"],obj["/Height"]),data)
                converted=convert(image.convert("RGB"))
                import zlib
                obj._data=zlib.compress(converted.tobytes())
                obj[NameObject("/Filter")]=NameObject("/FlateDecode")
                for key in ("/DecodeParms","/Decode"):obj.pop(NameObject(key),None)
                obj[NameObject("/ColorSpace")]=NameObject("/DeviceCMYK")
                obj[NameObject("/BitsPerComponent")]=NumberObject(8)
                if hasattr(obj,"decoded_self"):obj.decoded_self=None
    for page in writer.pages:
        if page.get("/Resources"): resources(page["/Resources"])
        original=page.get_contents()
        if original is not None: page[NameObject("/Contents")]=writer._add_object(content(original))
    if not profile_data:
        return
    profile=DecodedStreamObject();profile.set_data(profile_data);profile[NameObject("/N")]=NumberObject(4)
    intent=DictionaryObject({NameObject("/Type"):NameObject("/OutputIntent"),NameObject("/S"):NameObject("/GTS_PDFX"),NameObject("/OutputConditionIdentifier"):TextStringObject(validate_profile(profile_data)),NameObject("/DestOutputProfile"):writer._add_object(profile.flate_encode())})
    writer._root_object[NameObject("/OutputIntents")]=ArrayObject([writer._add_object(intent)])
