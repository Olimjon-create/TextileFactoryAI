"""Katalog ko'rinishini sinash uchun DEMO zavodlar va mahsulotlar.

Ishlatish (backend papkasida):
    python -m scripts.seed_demo            # demo ma'lumotlarni qo'shish (qayta ishga tushirish xavfsiz)
    python -m scripts.seed_demo --download-photos   # + suratlarni loyiha ichiga (media/demo/photos) yuklab olish
    python -m scripts.seed_demo --remove   # demo ma'lumotlarni butunlay o'chirish

MUHIM: bu yerdagi brendlar platformada haqiqatan sotmaydi. Tavsiflar umumma'lum faktlar asosida
qisqa yozilgan, narxlar taxminiy. Logo va muqovalar shu skript tomonidan chizilgan; mahsulot suratlari —
Pexels'dagi bepul litsenziyali namunaviy suratlar (scripts/demo_photos.py). Brendlarning o'z
rasm/logo/matnlari ishlatilmagan. Sayt ommaga ochilishidan oldin `--remove` bilan o'chiring.
"""

import shutil
import sys
from dataclasses import dataclass, field
from xml.sax.saxutils import escape

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.migrations import run_migrations
from app.models import Factory, Product
from app.models.product import ProductionUnit, ProductStatus
from app.services.upload_service import media_dir
from scripts.demo_photos import PHOTOS, download_all, photo_url

DEMO_NOTE = "Demo ma'lumot: platforma ko'rinishini sinash uchun qo'shilgan, narxlar taxminiy."
PHOTO_NOTE = "Mahsulot suratlari — Pexels'dagi bepul litsenziyali namunaviy suratlar, brendning o'z mahsuloti emas."
DEMO_DIR = "demo"


@dataclass
class DemoProduct:
    name: str
    code: str
    category: str
    price: int
    shape: str
    colors: list[str]
    sizes: list[str]
    description: str


@dataclass
class DemoFactory:
    slug: str
    name: str
    city: str
    short: str
    description: str
    colors: tuple[str, str]
    font: str
    tagline: str
    products: list[DemoProduct] = field(default_factory=list)


ADULT = ["XS", "S", "M", "L", "XL"]
MEN = ["S", "M", "L", "XL", "XXL"]
JEANS = ["28", "30", "32", "34", "36"]

FACTORIES: list[DemoFactory] = [
    DemoFactory(
        "zara", "Zara", "A Coruña, Ispaniya",
        "Ayollar, erkaklar va bolalar uchun zamonaviy kundalik kiyimlar",
        "1975-yilda Ispaniyada tashkil topgan, Inditex guruhiga kiradi. Kolleksiyalarni juda tez yangilash "
        "(\"fast fashion\") modeli bilan mashhur: dizayndan do'kon javonigacha bir necha hafta. "
        "Asosiy yo'nalishlar — futbolkalar, ko'ylaklar, jinsi, blazer va paltolar.",
        ("#111111", "#4a4a4a"), "serif", "NEW COLLECTION",
        [
            DemoProduct("Oversize paxta futbolka", "ZR-TS-01", "Futbolka", 249000, "tshirt", ["Oq", "Qora", "Bej"], ADULT,
                        "Qalin paxta trikotaj, erkin bichim, yumaloq yoqa."),
            DemoProduct("Zig'ir aralash ko'ylak", "ZR-SH-02", "Ko'ylak", 459000, "shirt", ["Oq", "Ko'k"], MEN,
                        "Yozgi zig'ir aralash mato, klassik yoqa."),
            DemoProduct("Straight fit jinsi", "ZR-JN-03", "Jinsi", 599000, "pants", ["Ko'k"], JEANS,
                        "To'g'ri bichim, o'rtacha bel, 100% paxta denim."),
            DemoProduct("Uzun ayollar ko'ylagi", "ZR-DR-04", "Ayollar ko'ylagi", 699000, "dress", ["Qora", "Qizil"], ADULT,
                        "Oqib turuvchi viskoza mato, midi uzunlik."),
            DemoProduct("Jun aralash palto", "ZR-CT-05", "Palto", 1490000, "coat", ["Bej", "Kulrang"], ADULT,
                        "Jun aralash mato, tizzagacha uzunlik, ikki qator tugma."),
        ],
    ),
    DemoFactory(
        "polo-ralph-lauren", "Polo Ralph Lauren", "Nyu-York, AQSH",
        "Klassik amerikan uslubi: pike polo, oxford ko'ylak va chinos",
        "Ralph Lauren 1967-yilda galstuklar bilan boshlagan, Polo liniyasi amerikan klassik uslubining "
        "timsoliga aylandi. Eng mashhur mahsuloti — ko'krakdagi chavandoz belgisi tushirilgan pike polo futbolka.",
        ("#0b1f44", "#1d3f7a"), "serif", "CLASSIC SINCE 1967",
        [
            DemoProduct("Custom Slim Fit pike polo", "PRL-PL-01", "Polo", 1190000, "polo", ["Ko'k", "Oq", "Qizil", "Yashil"], MEN,
                        "Paxta pike, ikki tugmali planka, tor bichim."),
            DemoProduct("Oxford ko'ylak", "PRL-SH-02", "Ko'ylak", 1590000, "shirt", ["Havorang", "Oq"], MEN,
                        "Oxford paxta mato, tugmali yoqa."),
            DemoProduct("Kabel naqshli sviter", "PRL-SW-03", "Sviter", 2390000, "sweater", ["Bej", "Ko'k"], MEN,
                        "Paxta kabel to'qima, klassik yumaloq yoqa."),
            DemoProduct("Slim chinos shim", "PRL-PT-04", "Shim", 1390000, "pants", ["Bej", "Ko'k"], JEANS,
                        "Elastik paxta twill, tor bichim."),
        ],
    ),
    DemoFactory(
        "loro-piana", "Loro Piana", "Quarona, Italiya",
        "Kashmir, vikunya va eng nozik junlardan hashamatli kiyimlar",
        "1924-yilda Italiyaning Piemont mintaqasida asos solingan to'qimachilik oilaviy korxonasi. "
        "Xomashyoni o'zi tanlaydi: mo'g'ul va xitoy kashmiri, And tog'lari vikunyasi, merinos juni. "
        "Mato ishlab chiqarishdan tayyor kiyimgacha to'liq sikl.",
        ("#5b4636", "#a38b6d"), "serif", "FINEST FIBRES",
        [
            DemoProduct("Baby cashmere sviter", "LP-SW-01", "Sviter", 24900000, "sweater", ["Bej", "Kulrang"], ADULT,
                        "Yosh echkilarning eng nozik kashmiri, yengil va issiq."),
            DemoProduct("Kashmir polo", "LP-PL-02", "Polo", 19900000, "polo", ["Jigarrang", "Ko'k"], MEN,
                        "Nozik kashmir trikotaj, klassik polo bichimi."),
            DemoProduct("Jun va kashmir palto", "LP-CT-03", "Palto", 64900000, "coat", ["Bej", "Jigarrang"], ADULT,
                        "Qo'lda tikilgan detallar, ikki tomonlama mato."),
        ],
    ),
    DemoFactory(
        "uniqlo", "Uniqlo", "Tokio, Yaponiya",
        "Sifatli bazaviy kiyimlar va texnologik matolar: AIRism, HEATTECH",
        "Yaponiyaning Fast Retailing kompaniyasiga qarashli, birinchi do'koni 1984-yilda Xirosimada ochilgan. "
        "\"LifeWear\" falsafasi — har kuni kiyiladigan oddiy, sifatli va arzon kiyimlar. Issiqlik saqlovchi "
        "va salqinlatuvchi texnologik matolari bilan tanilgan.",
        ("#c8102e", "#e8384f"), "sans", "LIFEWEAR",
        [
            DemoProduct("AIRism paxta futbolka", "UQ-TS-01", "Futbolka", 179000, "tshirt", ["Oq", "Qora", "Kulrang", "Ko'k"], ADULT,
                        "Salqinlatuvchi AIRism va paxta aralashmasi."),
            DemoProduct("HEATTECH uzun yengli", "UQ-SW-02", "Termo kiyim", 219000, "sweater", ["Qora", "Kulrang"], ADULT,
                        "Tana issiqligini saqlovchi yupqa ichki kiyim."),
            DemoProduct("Yengil puxovik kurtka", "UQ-CT-03", "Kurtka", 899000, "coat", ["Qora", "Ko'k", "Yashil"], ADULT,
                        "Ultra yengil, yig'ib sumkaga solinadi."),
            DemoProduct("Selvedge jinsi", "UQ-JN-04", "Jinsi", 599000, "pants", ["Ko'k"], JEANS,
                        "Yaponiya denimi, klassik to'g'ri bichim."),
        ],
    ),
    DemoFactory(
        "levis", "Levi's", "San-Fransisko, AQSH",
        "Jinsi kiyimlarning asoschisi: 501 jinsi va trucker kurtkalar",
        "Levi Strauss & Co. 1853-yilda San-Fransiskoda tashkil topgan. Metall parchinli ishchi shimlari "
        "zamonaviy jinsining boshlanishi bo'lgan; 501 modeli bugungacha ishlab chiqariladi.",
        ("#8b1d1d", "#c0392b"), "sans", "ORIGINAL JEANS",
        [
            DemoProduct("501 Original jinsi", "LV-JN-501", "Jinsi", 1090000, "pants", ["Ko'k", "Qora"], JEANS,
                        "Klassik to'g'ri bichim, tugmali zamok."),
            DemoProduct("Trucker denim kurtka", "LV-CT-02", "Kurtka", 1290000, "coat", ["Ko'k"], MEN,
                        "Klassik denim kurtka, ko'krak cho'ntaklari."),
            DemoProduct("Logotipli futbolka", "LV-TS-03", "Futbolka", 349000, "tshirt", ["Oq", "Qizil"], ADULT,
                        "Paxta trikotaj, ko'krakda brend yozuvi."),
        ],
    ),
    DemoFactory(
        "lacoste", "Lacoste", "Parij, Fransiya",
        "Tennischi Rene Lakost asos solgan brend — pike polo va sport-klassik uslub",
        "1933-yilda tennis chempioni René Lacoste tomonidan asos solingan. Uning tennis uchun yaratgan "
        "qisqa yengli pike polo futbolkasi dunyodagi eng tanilgan polo modellaridan biriga aylandi.",
        ("#004526", "#1e7a4f"), "sans", "SINCE 1933",
        [
            DemoProduct("L.12.12 klassik polo", "LC-PL-1212", "Polo", 1390000, "polo", ["Oq", "Yashil", "Ko'k", "Qizil"], MEN,
                        "Paxta pike, klassik bichim, ikki tugma."),
            DemoProduct("Sport hudi", "LC-HD-02", "Hudi", 1790000, "hoodie", ["Kulrang", "Ko'k"], MEN,
                        "Paxta flis, kapyushonli."),
            DemoProduct("Ayollar polo ko'ylagi", "LC-DR-03", "Ayollar ko'ylagi", 1890000, "dress", ["Oq", "Ko'k"], ADULT,
                        "Pike mato, polo yoqali ko'ylak-libos."),
        ],
    ),
    DemoFactory(
        "benetton", "United Colors of Benetton", "Treviso, Italiya",
        "Rang-barang trikotaj: sviterlar, kardiganlar va bolalar kiyimlari",
        "1965-yilda Italiyaning Treviso shahrida Benetton oilasi tomonidan tashkil topgan. Yorqin rangli jun "
        "trikotaj va o'ziga xos reklama kampaniyalari bilan mashhur.",
        ("#006a4e", "#35a36f"), "sans", "UNITED COLORS",
        [
            DemoProduct("Merinos jun sviter", "UCB-SW-01", "Sviter", 690000, "sweater", ["Qizil", "Yashil", "Sariq", "Ko'k"], ADULT,
                        "100% merinos jun, yumaloq yoqa."),
            DemoProduct("Paxta futbolka", "UCB-TS-02", "Futbolka", 199000, "tshirt", ["Pushti", "Sariq", "Havorang"], ADULT,
                        "Organik paxta, yorqin ranglar."),
            DemoProduct("Bolalar hudisi", "UCB-HD-03", "Hudi", 390000, "hoodie", ["Sariq", "Qizil"], ["104", "116", "128", "140"],
                        "Yumshoq paxta flis, bolalar uchun."),
        ],
    ),
    DemoFactory(
        "hm", "H&M", "Stokgolm, Shvetsiya",
        "Hamyonbop moda: kundalik kiyimlar, bazaviy mahsulotlar va bolalar kolleksiyalari",
        "1947-yilda Shvetsiyada ayollar kiyimlari do'koni sifatida ochilgan. Bugun dunyoning eng yirik kiyim "
        "chakana savdo kompaniyalaridan biri; qayta ishlangan va organik materiallardan foydalanishni oshirib bormoqda.",
        ("#cc0000", "#ff4d4d"), "sans", "FASHION & QUALITY",
        [
            DemoProduct("Regular fit futbolka", "HM-TS-01", "Futbolka", 129000, "tshirt", ["Oq", "Qora", "Kulrang"], ADULT,
                        "Yumshoq paxta, kundalik kiyish uchun."),
            DemoProduct("Relaxed fit hudi", "HM-HD-02", "Hudi", 349000, "hoodie", ["Qora", "Bej"], ADULT,
                        "Erkin bichim, kenguru cho'ntak."),
            DemoProduct("Wide leg shim", "HM-PT-03", "Shim", 399000, "pants", ["Qora", "Bej"], JEANS,
                        "Keng bichim, yuqori bel."),
            DemoProduct("Gulli yozgi ko'ylak", "HM-DR-04", "Ayollar ko'ylagi", 449000, "dress", ["Pushti", "Oq"], ADULT,
                        "Yengil viskoza, gulli naqsh."),
        ],
    ),
]


COLOR_HEX = {
    "Oq": "#f7f7f5", "Qora": "#1f1f22", "Ko'k": "#1f3a93", "Havorang": "#8fb8de", "Qizil": "#c62828",
    "Yashil": "#2e7d32", "Bej": "#d8c3a5", "Kulrang": "#8d8f94", "Jigarrang": "#6d4c41", "Sariq": "#f9c80e",
    "Pushti": "#f06292",
}

SILHOUETTES = {
    "tshirt": "M200,120 L262,98 Q300,128 338,98 L400,120 L482,198 L432,250 L400,224 L400,510 L200,510 L200,224 L168,250 L118,198 Z",
    "polo": "M200,120 L262,98 Q300,128 338,98 L400,120 L482,198 L432,250 L400,224 L400,510 L200,510 L200,224 L168,250 L118,198 Z",
    "shirt": "M200,120 L262,98 Q300,128 338,98 L400,120 L470,310 L452,480 L414,476 L424,318 L400,240 L400,510 L200,510 L200,240 L176,318 L186,476 L148,480 L130,310 Z",
    "sweater": "M200,120 L262,98 Q300,128 338,98 L400,120 L470,310 L452,480 L414,476 L424,318 L400,240 L400,510 L200,510 L200,240 L176,318 L186,476 L148,480 L130,310 Z",
    "hoodie": "M200,125 L258,100 Q300,128 342,100 L400,125 L470,310 L452,480 L414,476 L424,318 L400,240 L400,510 L200,510 L200,240 L176,318 L186,476 L148,480 L130,310 Z",
    "coat": "M200,110 L262,92 Q300,118 338,92 L400,110 L472,310 L456,500 L418,496 L426,318 L404,240 L412,540 L188,540 L196,240 L174,318 L182,496 L144,500 L128,310 Z",
    "pants": "M212,100 L388,100 L408,520 L322,520 L300,232 L278,520 L192,520 Z",
    "dress": "M248,96 Q300,126 352,96 L372,108 L362,236 L446,530 L154,530 L238,236 L228,108 Z",
}


def _details(shape: str, stroke: str) -> str:
    """Siluet ustidagi detallar: yoqa, tugmalar, cho'ntaklar."""
    s = f'stroke="{stroke}" stroke-width="3" fill="none" stroke-linecap="round"'
    if shape == "polo":
        return (f'<path d="M262,98 L300,150 L338,98" {s}/><path d="M262,98 L282,82 M338,98 L318,82" {s}/>'
                f'<line x1="300" y1="150" x2="300" y2="210" {s}/>'
                f'<circle cx="300" cy="172" r="4" fill="{stroke}"/><circle cx="300" cy="196" r="4" fill="{stroke}"/>')
    if shape == "shirt":
        return (f'<path d="M262,98 L300,150 L338,98 M262,98 L278,78 L300,110 L322,78 L338,98" {s}/>'
                f'<line x1="300" y1="150" x2="300" y2="505" {s}/>'
                + "".join(f'<circle cx="300" cy="{y}" r="4" fill="{stroke}"/>' for y in range(185, 500, 60)))
    if shape == "sweater":
        return (f'<path d="M262,98 Q300,140 338,98" {s}/>'
                + "".join(f'<line x1="{x}" y1="486" x2="{x}" y2="508" {s}/>' for x in range(212, 400, 14)))
    if shape == "hoodie":
        return (f'<path d="M250,112 Q300,20 350,112" {s} fill-opacity="0"/><path d="M270,110 Q300,150 330,110" {s}/>'
                f'<path d="M235,400 L365,400 L380,470 L220,470 Z" {s}/>'
                f'<line x1="288" y1="130" x2="284" y2="200" {s}/><line x1="312" y1="130" x2="316" y2="200" {s}/>')
    if shape == "coat":
        return (f'<path d="M262,92 L300,300 L338,92" {s}/><line x1="300" y1="300" x2="300" y2="538" {s}/>'
                + "".join(f'<circle cx="{x}" cy="{y}" r="5" fill="{stroke}"/>' for y in (340, 400, 460) for x in (272, 328))
                + f'<path d="M216,420 L260,420 M340,420 L384,420" {s}/>')
    if shape == "pants":
        return (f'<line x1="212" y1="130" x2="388" y2="130" {s}/><line x1="300" y1="130" x2="300" y2="230" {s}/>'
                f'<path d="M228,140 Q240,190 270,196 M372,140 Q360,190 330,196" {s}/>')
    if shape == "dress":
        return f'<path d="M238,236 Q300,256 362,236" {s}/>'
    return f'<path d="M262,98 Q300,132 338,98" {s}/>'


def product_svg(shape: str, color_name: str, seed_hex: str) -> str:
    fill = COLOR_HEX.get(color_name, "#607d8b")
    stroke = "rgba(0,0,0,0.22)" if fill not in ("#1f1f22", "#1f3a93", "#6d4c41") else "rgba(255,255,255,0.35)"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
<defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="{seed_hex}" stop-opacity="0.18"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity="0.18"/></filter></defs>
<rect width="600" height="600" fill="#f4f5f8"/><rect width="600" height="600" fill="url(#bg)"/>
<ellipse cx="300" cy="555" rx="170" ry="16" fill="#000" opacity="0.06"/>
<g filter="url(#sh)"><path d="{SILHOUETTES[shape]}" fill="{fill}" stroke="{stroke}" stroke-width="3" stroke-linejoin="round"/></g>
{_details(shape, stroke)}
</svg>"""


_ON_BODY = {
    "pants": (0.79, 351),
    "coat": (1.05, 73),
    "dress": (1.04, 70),
}
_TOP = (0.75, 96)
MANNEQUIN = "#dcd8d2"
MANNEQUIN_SHADE = "#c9c4bc"


def _garment(shape: str, fill: str, stroke: str) -> str:
    sy, ty = _ON_BODY.get(shape, _TOP)
    return (
        f'<g transform="translate(0,{ty}) scale(1,{sy})">'
        f'<path d="{SILHOUETTES[shape]}" fill="{fill}" stroke="{stroke}" stroke-width="3" stroke-linejoin="round"/>'
        f"{_details(shape, stroke)}</g>"
    )


def model_svg(shape: str, color_name: str, seed_hex: str) -> str:
    """Kiyimning odam (maneken) ustida qanday turishini ko'rsatuvchi rasm (600×800)."""
    fill = COLOR_HEX.get(color_name, "#607d8b")
    dark = fill in ("#1f1f22", "#1f3a93", "#6d4c41")
    stroke = "rgba(255,255,255,0.35)" if dark else "rgba(0,0,0,0.22)"
    is_bottom = shape == "pants"
    companion = _garment("tshirt", "#f2f1ee", "rgba(0,0,0,0.18)") if is_bottom else _garment("pants", "#3d3f46", "rgba(255,255,255,0.18)")
    body = (
        f'<path d="M262,430 L250,748 M338,430 L350,748" stroke="{MANNEQUIN}" stroke-width="46" stroke-linecap="round"/>'
        f'<ellipse cx="246" cy="760" rx="34" ry="12" fill="{MANNEQUIN_SHADE}"/><ellipse cx="354" cy="760" rx="34" ry="12" fill="{MANNEQUIN_SHADE}"/>'
        f'<path d="M205,190 L160,330 L150,462 M395,190 L440,330 L450,462" stroke="{MANNEQUIN}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<circle cx="150" cy="470" r="17" fill="{MANNEQUIN}"/><circle cx="450" cy="470" r="17" fill="{MANNEQUIN}"/>'
        f'<path d="M205,185 Q300,160 395,185 L380,440 L220,440 Z" fill="{MANNEQUIN}"/>'
        f'<rect x="282" y="120" width="36" height="62" rx="14" fill="{MANNEQUIN_SHADE}"/>'
        f'<ellipse cx="300" cy="86" rx="40" ry="50" fill="{MANNEQUIN}"/>'
    )
    garment = _garment(shape, fill, stroke)
    layers = garment + companion if is_bottom else companion + garment
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="{seed_hex}" stop-opacity="0.16"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.16"/></filter></defs>
<rect width="600" height="800" fill="#f4f5f8"/><rect width="600" height="800" fill="url(#bg)"/>
<ellipse cx="300" cy="770" rx="150" ry="14" fill="#000" opacity="0.07"/>
<g filter="url(#sh)">{body}{layers}</g>
</svg>"""


def cover_svg(f: DemoFactory) -> str:
    a, b = f.colors
    family = "Georgia, 'Times New Roman', serif" if f.font == "serif" else "'Helvetica Neue', Arial, sans-serif"
    weight = "400" if f.font == "serif" else "800"
    title = f.name.upper() if f.font == "serif" else f.name
    char_width = 0.78 if f.font == "serif" else 0.62
    size = int(min(150, 760 / (len(title) * char_width)))
    cap_height = int(size * 0.72)
    block = cap_height + 58
    title_y = 350 - block // 2 + cap_height
    lines = "".join(
        f'<line x1="{x}" y1="0" x2="{x - 700}" y2="700" stroke="#fff" stroke-opacity="0.05" stroke-width="2"/>'
        for x in range(0, 2400, 48)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>
<rect width="1600" height="700" fill="url(#g)"/>{lines}
<circle cx="1380" cy="120" r="260" fill="#fff" opacity="0.05"/><circle cx="160" cy="640" r="220" fill="#fff" opacity="0.04"/>
<text x="800" y="{title_y}" text-anchor="middle" fill="#fff" font-family="{family}" font-weight="{weight}" font-size="{size}" letter-spacing="{4 if f.font == 'serif' else 1}">{escape(title)}</text>
<text x="800" y="{title_y + 58}" text-anchor="middle" fill="#fff" fill-opacity="0.75" font-family="'Helvetica Neue', Arial, sans-serif" font-size="26" letter-spacing="10">{escape(f.tagline)}</text>
</svg>"""


def logo_svg(f: DemoFactory) -> str:
    a, _ = f.colors
    family = "Georgia, serif" if f.font == "serif" else "Arial, sans-serif"
    initials = "".join(w[0] for w in f.name.replace("&", " ").split()[:2]).upper()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<rect width="400" height="400" fill="{a}"/>
<text x="200" y="258" text-anchor="middle" fill="#fff" font-family="{family}" font-weight="700" font-size="{170 if len(initials) == 1 else 140}">{escape(initials)}</text>
</svg>"""


def _write(rel_path: str, content: str) -> str:
    path = media_dir() / DEMO_DIR / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return f"/media/{DEMO_DIR}/{rel_path}"


def _demo_factories(db):
    names = [f.name for f in FACTORIES]
    return db.scalars(
        select(Factory).where(Factory.name.in_(names), Factory.description.contains(DEMO_NOTE))
    ).all()


def _write_images(f: DemoFactory) -> tuple[str, str, dict[str, tuple[str, str]]]:
    """Qaytaradi: logo, muqova, {kod: (mahsulot rasmi, odam ustidagi rasm)}.

    Mahsulot uchun Pexels fotosuratlari bo'lsa (scripts/demo_photos.py) — ular, aks holda chizilgan SVG.
    """
    logo = _write(f"{f.slug}/logo.svg", logo_svg(f))
    cover = _write(f"{f.slug}/cover.svg", cover_svg(f))
    products = {}
    for p in f.products:
        if p.code in PHOTOS:
            product_photo, model_photo = PHOTOS[p.code]
            products[p.code] = (photo_url(product_photo, media_dir()), photo_url(model_photo, media_dir()))
        else:
            products[p.code] = (
                _write(f"{f.slug}/{p.code.lower()}.svg", product_svg(p.shape, p.colors[0], f.colors[1])),
                _write(f"{f.slug}/{p.code.lower()}-model.svg", model_svg(p.shape, p.colors[0], f.colors[1])),
            )
    return logo, cover, products


def _description(f: DemoFactory) -> str:
    return f"{f.description}\n\n{DEMO_NOTE} {PHOTO_NOTE}"


def seed() -> None:
    run_migrations()
    with SessionLocal() as db:
        demo = {f.name: f for f in _demo_factories(db)}
        added = 0
        for f in FACTORIES:
            logo, cover, images = _write_images(f)
            if f.name in demo:
                demo[f.name].description = _description(f)
                for product in db.scalars(select(Product).where(Product.factory_id == demo[f.name].id)):
                    if product.code in images:
                        product.image_url, product.model_image_url = images[product.code]
                continue
            factory = Factory(
                name=f.name,
                city=f.city,
                short_description=f.short,
                description=_description(f),
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
                        code=p.code,
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
    print(f"Demo zavodlar qo'shildi: {added}, yangilandi: {len(demo)}")


def remove() -> None:
    with SessionLocal() as db:
        factories = _demo_factories(db)
        for factory in factories:
            db.delete(factory)
        db.commit()
    shutil.rmtree(media_dir() / DEMO_DIR, ignore_errors=True)
    print(f"Demo zavodlar o'chirildi: {len(factories)}")


if __name__ == "__main__":
    if "--remove" in sys.argv:
        remove()
    else:
        if "--download-photos" in sys.argv:
            new, existed = download_all(media_dir())
            print(f"Suratlar loyihaga yuklandi: {new} ta yangi, {existed} ta avvaldan bor")
        seed()
