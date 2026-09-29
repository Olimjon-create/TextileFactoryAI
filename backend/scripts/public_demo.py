"""Ochiq (internetga chiqarilgan) deploy uchun demo katalog — TO'QIMA brendlar bilan.

`seed_demo.py` dagi haqiqiy brend nomlari (Zara, Lacoste, ...) ularning tarixi va savdo belgili
mahsulot nomlari (501, L.12.12, AIRism, HEATTECH) ochiq saytda ishlatilmaydi. Bu yerda o'sha
mahsulotlar, narxlar va Pexels suratlari to'qima ishlab chiqaruvchilar nomi bilan beriladi.

Ikki qism:
  1) Suratlar (logo, muqova, SVG mahsulotlar, Pexels fotolari) — oldindan
     frontend/public/media/demo ga yoziladi va git'ga qo'shiladi (Vercel ularni statik beradi):
         python -m scripts.public_demo --build-assets      (backend papkasida)
  2) Bazaga yozuvlar — serverda fayl yozmasdan, faqat /media/demo/... manzillari bilan.
     Deployda SEED_PUBLIC_DEMO=true bo'lsa ishga tushishda avtomatik (app.main.prepare).
"""

import shutil
import sys
from dataclasses import replace
from pathlib import Path

from sqlalchemy import select, text

from app.core.database import SessionLocal
from app.models import Factory, Product
from app.models.product import ProductionUnit, ProductStatus
from app.services.upload_service import media_dir
from scripts.demo_photos import LOCAL_DIR, PHOTOS, _local_file
from scripts.seed_demo import (
    DEMO_NOTE,
    FACTORIES,
    PHOTO_NOTE,
    DemoFactory,
    cover_svg,
    logo_svg,
    model_svg,
    product_svg,
)

FRONTEND_PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public"

_BRANDS: dict[str, tuple] = {
    "zara": (
        "atlas-moda", "Atlas Moda", "Toshkent",
        "Ayollar, erkaklar va bolalar uchun zamonaviy kundalik kiyimlar",
        "Toshkentdagi tikuv fabrikasi. Kolleksiyalarni har mavsum yangilaydi: dizayndan tayyor mahsulotgacha "
        "3–4 hafta. Asosiy yo'nalishlar — futbolkalar, ko'ylaklar, jinsi va paltolar.",
        ("#2b2d42", "#5c677d"), "serif", "NEW SEASON", "AM",
    ),
    "polo-ralph-lauren": (
        "harbor-classic", "Harbor Classic", "Samarqand",
        "Klassik uslub: pike polo, oxford ko'ylak va chinos",
        "Samarqanddagi oilaviy tikuv korxonasi. Klassik erkaklar kiyimi — polo, ko'ylak va shimlar — "
        "mahalliy paxtadan, yigiruvdan tikuvgacha to'liq siklda ishlab chiqariladi.",
        ("#27374d", "#526d82"), "serif", "CLASSIC COTTON", "HC",
    ),
    "loro-piana": (
        "pamir-cashmere", "Pamir Cashmere", "Marg'ilon",
        "Kashmir va nozik jundan premium kiyimlar",
        "Nozik jun va kashmirdan premium kiyimlar tayyorlaydigan atelye. Xomashyo — tog' echkilari kashmiri "
        "va merinos juni; mato to'qish va tikuv bir joyda, ko'p detallar qo'lda tikiladi.",
        ("#6b5344", "#b09a82"), "serif", "FINEST FIBRES", "PC",
    ),
    "uniqlo": (
        "daily-basics", "Daily Basics", "Namangan",
        "Sifatli bazaviy kiyimlar va texnologik matolar",
        "Har kuni kiyiladigan oddiy, sifatli va hamyonbop kiyimlar ishlab chiqaruvchisi. Salqinlatuvchi va "
        "issiqlik saqlovchi aralash matolar bilan ishlaydi.",
        ("#3a506b", "#5bc0be"), "sans", "EVERYDAY WEAR", "DB",
    ),
    "levis": (
        "indigo-works", "Indigo Works", "Farg'ona",
        "Denim ustaxonasi: jinsi va denim kurtkalar",
        "Farg'ona vodiysi paxtasidan to'qilgan denim. Klassik parchinli jinsilar, denim kurtkalar va "
        "kundalik futbolkalar.",
        ("#1d3557", "#457b9d"), "sans", "RAW DENIM", "IW",
    ),
    "lacoste": (
        "court-sport", "Court Sport", "Andijon",
        "Sport-klassik uslub: pike polo va hudilar",
        "Tennis kortidan ilhomlangan sport-klassik kiyimlar. Asosiy mahsulot — nafas oladigan paxta pike polo; "
        "yonida hudi va polo-libos.",
        ("#40513b", "#8a9a5b"), "sans", "COURT CLASSICS", "CS",
    ),
    "benetton": (
        "rangin-trikotaj", "Rangin Trikotaj", "Buxoro",
        "Rang-barang trikotaj: sviterlar va bolalar kiyimlari",
        "Yorqin rangli jun va paxta trikotaj ustaxonasi. Merinos sviterlar, organik paxta futbolkalar va "
        "bolalar hudilari.",
        ("#9c4f96", "#ff6355"), "sans", "COLOURFUL KNITS", "RT",
    ),
    "hm": (
        "nova-style", "Nova Style", "Qo'qon",
        "Hamyonbop moda: kundalik kiyimlar va bolalar kolleksiyalari",
        "Keng assortimentli hamyonbop kiyimlar fabrikasi. Qayta ishlangan va organik paxtadan foydalanishni "
        "oshirib bormoqda.",
        ("#7f5539", "#b08968"), "sans", "FASHION FOR ALL", "NS",
    ),
}

_PRODUCT_NAMES = {
    "AIRism paxta futbolka": "Salqin paxta futbolka",
    "HEATTECH uzun yengli": "Termo uzun yengli",
    "501 Original jinsi": "Klassik to'g'ri jinsi",
    "L.12.12 klassik polo": "Klassik pike polo",
    "Custom Slim Fit pike polo": "Slim fit pike polo",
    "Logotipli futbolka": "Yozuvli paxta futbolka",
}
_PRODUCT_DESCRIPTIONS = {
    "Yozuvli paxta futbolka": "Paxta trikotaj, ko'krakda ustaxona yozuvi.",
    "Salqin paxta futbolka": "Salqinlatuvchi sintetik tola va paxta aralashmasi.",
}


def public_factories() -> list[tuple[DemoFactory, dict[str, str]]]:
    """To'qima brendlar va har biri uchun {asl kod: yangi kod} (asl kod — surat kaliti)."""
    result = []
    for f in FACTORIES:
        slug, name, city, short, description, colors, font, tagline, prefix = _BRANDS[f.slug]
        codes: dict[str, str] = {}
        products = []
        for i, p in enumerate(f.products, start=1):
            codes[p.code] = f"{prefix}-{p.code.split('-')[1]}-{i:02d}"
            new_name = _PRODUCT_NAMES.get(p.name, p.name)
            products.append(replace(p, name=new_name, description=_PRODUCT_DESCRIPTIONS.get(new_name, p.description)))
        result.append(
            (
                replace(f, slug=slug, name=name, city=city, short=short, description=description, colors=colors,
                        font=font, tagline=tagline, products=products),
                codes,
            )
        )
    return result


def _photo_url(path: str) -> str:
    """Pexels surati — frontend/public ichidagi nusxaning manzili (fayl mavjudligi tekshirilmaydi)."""
    return "/media/" + "/".join((*LOCAL_DIR, _local_file(Path("."), path).name))


def _urls(f: DemoFactory, codes: dict[str, str]) -> tuple[str, str, dict[str, tuple[str, str]]]:
    base = f"/media/demo/{f.slug}"
    images = {}
    for p in f.products:
        if p.code in PHOTOS:
            product_photo, model_photo = PHOTOS[p.code]
            images[p.code] = (_photo_url(product_photo), _photo_url(model_photo))
        else:
            new = codes[p.code].lower()
            images[p.code] = (f"{base}/{new}.svg", f"{base}/{new}-model.svg")
    return f"{base}/logo.svg", f"{base}/cover.svg", images


def build_assets(out: Path = FRONTEND_PUBLIC / "media" / "demo") -> int:
    """Logo/muqova/SVG mahsulotlarni chizadi va kerakli Pexels fotolarini `out` ga ko'chiradi."""
    written = 0
    for f, codes in public_factories():
        folder = out / f.slug
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "logo.svg").write_text(logo_svg(f), encoding="utf-8")
        (folder / "cover.svg").write_text(cover_svg(f), encoding="utf-8")
        written += 2
        for p in f.products:
            if p.code in PHOTOS:
                for path in PHOTOS[p.code]:
                    source = _local_file(media_dir(), path)
                    if not source.exists():
                        raise SystemExit(f"Surat topilmadi: {source}. Avval: python -m scripts.seed_demo --download-photos")
                    target = out.joinpath(*LOCAL_DIR[1:], source.name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(source, target)
                    written += 1
            else:
                new = codes[p.code].lower()
                (folder / f"{new}.svg").write_text(product_svg(p.shape, p.colors[0], f.colors[1]), encoding="utf-8")
                (folder / f"{new}-model.svg").write_text(model_svg(p.shape, p.colors[0], f.colors[1]), encoding="utf-8")
                written += 2
    return written


def seed_public() -> int:
    """To'qima demo zavodlarni bazaga qo'shadi (bor bo'lsa — hech narsa qilmaydi). Fayl yozmaydi."""
    brands = public_factories()
    with SessionLocal() as db:
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(724002)"))
        existing = set(
            db.scalars(
                select(Factory.name).where(
                    Factory.name.in_([f.name for f, _ in brands]), Factory.description.contains(DEMO_NOTE)
                )
            )
        )
        added = 0
        for f, codes in brands:
            if f.name in existing:
                continue
            logo, cover, images = _urls(f, codes)
            factory = Factory(
                name=f.name,
                city=f.city,
                short_description=f.short,
                description=f"{f.description}\n\n{DEMO_NOTE} {PHOTO_NOTE}",
                logo_url=logo,
                cover_url=cover,
                is_active=True,
                is_public=True,
            )
            db.add(factory)
            db.flush()
            for p in f.products:
                db.add(
                    Product(
                        factory_id=factory.id,
                        name=p.name,
                        code=codes[p.code],
                        category=p.category,
                        description=p.description,
                        sizes=p.sizes,
                        colors=p.colors,
                        unit=ProductionUnit.PIECE,
                        status=ProductStatus.ACTIVE,
                        price=p.price,
                        image_url=images[p.code][0],
                        model_image_url=images[p.code][1],
                    )
                )
            added += 1
        db.commit()
    return added


if __name__ == "__main__":
    if "--build-assets" in sys.argv:
        print(f"Fayllar yozildi: {build_assets()}")
    else:
        print(__doc__)
