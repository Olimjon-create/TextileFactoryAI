"""Demo mahsulotlar uchun haqiqiy kiyim fotosuratlari (Pexels).

Pexels litsenziyasi (https://www.pexels.com/license/): tijoriy maqsadda ham bepul, muallifni
ko'rsatish shart emas. Suratlar Pexels serveridan to'g'ridan-to'g'ri ko'rsatiladi (yuklab olinmaydi).
Bu suratlar mos turdagi kiyimlarni ko'rsatadi, lekin aynan o'sha brendning mahsuloti EMAS.

Har bir mahsulot kodi uchun: (kiyimning o'zi, odam ustida).
"""

from pathlib import Path

import requests

PEXELS = "https://images.pexels.com/photos/{path}?auto=compress&cs=tinysrgb&w=900"
LOCAL_DIR = ("demo", "photos")


def _remote(path: str) -> str:
    return PEXELS.format(path=path)


def _local_file(media_root: Path, path: str) -> Path:
    photo_id = path.split("/")[0]
    ext = "png" if path.endswith(".png") else "jpg"
    return media_root.joinpath(*LOCAL_DIR, f"pexels-{photo_id}.{ext}")


def photo_url(path: str, media_root: Path | None = None) -> str:
    """Surat loyihaga yuklab olingan bo'lsa — lokal /media manzili, aks holda Pexels manzili."""
    if media_root is not None:
        local = _local_file(media_root, path)
        if local.exists():
            return "/media/" + "/".join((*LOCAL_DIR, local.name))
    return _remote(path)


def _is_image(data: bytes) -> bool:
    return data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n") or (
        data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    )


def download_all(media_root: Path) -> tuple[int, int]:
    """Barcha demo suratlarni loyihaga yuklab oladi. Qaytaradi: (yangi yuklangan, avvaldan bor)."""
    downloaded = existed = 0
    for product_path, model_path in PHOTOS.values():
        for path in (product_path, model_path):
            target = _local_file(media_root, path)
            if target.exists():
                existed += 1
                continue
            response = requests.get(_remote(path), headers={"User-Agent": "TextileFactoryAI-demo/1.0"}, timeout=30)
            response.raise_for_status()
            data = response.content
            if not _is_image(data):
                raise RuntimeError(f"Rasm emas: {path}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            downloaded += 1
    return downloaded, existed


PHOTOS: dict[str, tuple[str, str]] = {
    "ZR-TS-01": ("12025472/pexels-photo-12025472.jpeg", "9775441/pexels-photo-9775441.jpeg"),
    "ZR-SH-02": (
        "28576630/pexels-photo-28576630/free-photo-of-minimalist-white-shirt-on-hanger-close-up.jpeg",
        "9637778/pexels-photo-9637778.jpeg",
    ),
    "ZR-JN-03": (
        "7764608/pexels-photo-7764608.jpeg",
        "32638326/pexels-photo-32638326/free-photo-of-casual-portrait-of-smiling-man-in-urban-setting.jpeg",
    ),
    "ZR-DR-04": (
        "18984479/pexels-photo-18984479/free-photo-of-dress-in-wardrobe.jpeg",
        "17245413/pexels-photo-17245413/free-photo-of-model-in-long-black-dress.jpeg",
    ),
    "ZR-CT-05": (
        "31733950/pexels-photo-31733950/free-photo-of-elegant-coat-closet-with-stylish-outerwear.jpeg",
        "4872101/pexels-photo-4872101.jpeg",
    ),
    "PRL-PL-01": (
        "20763273/pexels-photo-20763273/free-photo-of-folded-polo-shirt.jpeg",
        "38010898/pexels-photo-38010898/free-photo-of-man-in-blue-polo-shirt-standing-by-ornate-door.jpeg",
    ),
    "PRL-SH-02": (
        "13381986/pexels-photo-13381986.jpeg",
        "19189138/pexels-photo-19189138/free-photo-of-man-in-a-blue-shirt-and-white-t-shirt.jpeg",
    ),
    "PRL-SW-03": (
        "28259752/pexels-photo-28259752/free-photo-of-stack-of-cozy-folded-knitted-sweaters-in-soft-light.jpeg",
        "36510855/pexels-photo-36510855/free-photo-of-portrait-of-man-in-cozy-knit-sweater.jpeg",
    ),
    "PRL-PT-04": (
        "33633245/pexels-photo-33633245/free-photo-of-flat-lay-of-men-s-casual-outfits-on-blue-background.jpeg",
        "16721806/pexels-photo-16721806/free-photo-of-man-with-a-beard-standing-on-the-pavement-in-a-town.jpeg",
    ),
    "LP-SW-01": (
        "14642651/pexels-photo-14642651.jpeg",
        "15235481/pexels-photo-15235481/free-photo-of-close-up-shot-of-a-blonde-man-in-white-knitted-sweater.jpeg",
    ),
    "LP-PL-02": (
        "11100267/pexels-photo-11100267.jpeg",
        "17984122/pexels-photo-17984122/free-photo-of-young-man-in-jeans-and-a-polo-t-shirt-posing-in-studio.jpeg",
    ),
    "LP-CT-03": (
        "10772702/pexels-photo-10772702.jpeg",
        "19169192/pexels-photo-19169192/free-photo-of-woman-wearing-an-autumn-coat.jpeg",
    ),
    "UQ-TS-01": (
        "37704849/pexels-photo-37704849/free-photo-of-white-t-shirt-on-wooden-floor-in-sunlight.jpeg",
        "10788951/pexels-photo-10788951.jpeg",
    ),
    "UQ-SW-02": ("8306388/pexels-photo-8306388.jpeg", "7580994/pexels-photo-7580994.jpeg"),
    "UQ-CT-03": (
        "16341730/pexels-photo-16341730/free-photo-of-jacket-on-hanger.jpeg",
        "15639609/pexels-photo-15639609/free-photo-of-blonde-in-puffer-jacket.jpeg",
    ),
    "UQ-JN-04": (
        "4109759/pexels-photo-4109759.jpeg",
        "30133696/pexels-photo-30133696/free-photo-of-casual-portrait-of-man-in-denim-outfit.jpeg",
    ),
    "LV-JN-501": (
        "6924338/pexels-photo-6924338.jpeg",
        "26125921/pexels-photo-26125921/free-photo-of-smiling-man-in-black-t-shirt.jpeg",
    ),
    "LV-CT-02": (
        "16428734/pexels-photo-16428734/free-photo-of-denim-jacket-in-midair.jpeg",
        "14416498/pexels-photo-14416498.jpeg",
    ),
    "LV-TS-03": (
        "37704843/pexels-photo-37704843/free-photo-of-minimalist-white-t-shirt-on-wooden-floor.jpeg",
        "8217461/pexels-photo-8217461.jpeg",
    ),
    "LC-PL-1212": (
        "36074834/pexels-photo-36074834/free-photo-of-colorful-assortment-of-t-shirts-on-hangers.jpeg",
        "11751211/pexels-photo-11751211.jpeg",
    ),
    "LC-HD-02": ("6786666/pexels-photo-6786666.jpeg", "10816575/pexels-photo-10816575.jpeg"),
    "LC-DR-03": (
        "18984601/pexels-photo-18984601/free-photo-of-dress-in-wardrobe.jpeg",
        "27064329/pexels-photo-27064329/free-photo-of-woman-in-white-dress-at-tennis-court.jpeg",
    ),
    "UCB-SW-01": (
        "34854182/pexels-photo-34854182/free-photo-of-stack-of-colorful-knit-sweaters-on-shelf.jpeg",
        "5709914/pexels-photo-5709914.jpeg",
    ),
    "UCB-TS-02": ("9558246/pexels-photo-9558246.jpeg", "9558895/pexels-photo-9558895.jpeg"),
    "UCB-HD-03": ("12555806/pexels-photo-12555806.png", "14370986/pexels-photo-14370986.png"),
    "HM-TS-01": ("5746084/pexels-photo-5746084.jpeg", "8217504/pexels-photo-8217504.jpeg"),
    "HM-HD-02": ("9594422/pexels-photo-9594422.jpeg", "5825332/pexels-photo-5825332.jpeg"),
    "HM-PT-03": (
        "39457509/pexels-photo-39457509/free-photo-of-floral-wide-leg-trousers-fashion-photography.jpeg",
        "31400265/pexels-photo-31400265/free-photo-of-fashionable-woman-posing-in-stylish-beige-outfit.jpeg",
    ),
    "HM-DR-04": (
        "19733576/pexels-photo-19733576/free-photo-of-dresses-hanging-on-a-clothing-rack.jpeg",
        "17317551/pexels-photo-17317551/free-photo-of-woman-in-dress-sitting-by-table-and-posing.jpeg",
    ),
}
