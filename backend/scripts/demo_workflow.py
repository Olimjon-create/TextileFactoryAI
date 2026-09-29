"""Taqdimot uchun to'liq demo zavod: "Atlas Moda" (public_demo.py dagi to'qima brend) ichida real ish oqimi.

Mijoz → buyurtma → BOM → xarid → ombor → ishlab chiqarish (kesish…qadoqlash) → tayyor mahsulot → jo'natma,
xodimlar KPI, mashinalar, tannarx, kamera (AI) hodisalari. Hammasi mavjud API orqali yaratiladi —
barcha tekshiruvlar va avtomatik holatlar haqiqiy ishdagidek ishlaydi.

Demo hisoblar (paroli DEMO_PASSWORD) — faqat demo bazasi uchun:
  admin@demo.uz            — super admin
  direktor@atlasmoda.uz    — zavod egasi
  ishlab@atlasmoda.uz      — ishlab chiqarish menejeri
  ombor@atlasmoda.uz       — ombor menejeri
  sifat@atlasmoda.uz       — sifat nazorati menejeri

Ishga tushirish: SEED_PUBLIC_DEMO=true bo'lsa main.prepare() chaqiradi (Vercel). Qo'lda:
    python -m scripts.demo_workflow
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.roles import Role
from app.core.security import create_access_token, hash_password
from app.models import Factory, User

DEMO_PASSWORD = "Demo-2026"
FACTORY_NAME = "Atlas Moda"
ADMIN_EMAIL = "admin@demo.uz"
OWNER_EMAIL = "direktor@atlasmoda.uz"


class _Api:
    def __init__(self, client: TestClient, token: str):
        self.c, self.h = client, {"Authorization": f"Bearer {token}"}

    def __call__(self, method: str, url: str, body=None, **params):
        r = self.c.request(method, f"/api/v1{url}", headers=self.h, json=body, params=params or None)
        if r.status_code >= 400:
            raise RuntimeError(f"{method} {url} → {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else None

    def post(self, url, body=None):
        return self("POST", url, body or {})


def _token(user: User) -> str:
    return create_access_token(user.id, {"role": user.role.value})


def seed_workflow_demo() -> bool:
    """Demo zavodga ish oqimi ma'lumotlarini qo'shadi (bor bo'lsa — hech narsa qilmaydi)."""
    from app.main import app  # prepare() ichidan chaqiriladi — aylanma importdan qochish

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == OWNER_EMAIL)):
            return False
        factory = db.scalar(select(Factory).where(Factory.name == FACTORY_NAME))
        if factory is None:
            return False
        admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if admin is None:
            admin = User(email=ADMIN_EMAIL, full_name="Demo Administrator", role=Role.SUPER_ADMIN, hashed_password=hash_password(DEMO_PASSWORD))
            db.add(admin)
            db.commit()
            db.refresh(admin)
        factory_id = factory.id

    # Lifespan ishga tushmaydi (context manager'siz) — prepare() qayta chaqirilmaydi
    client = TestClient(app, raise_server_exceptions=True)
    sa = _Api(client, _token(admin))
    owner_user = sa.post("/users", {"full_name": "Sardor Rahimov", "email": OWNER_EMAIL, "password": DEMO_PASSWORD, "phone": "+998901234567",
                                    "role": "FACTORY_OWNER", "factory_id": factory_id})
    with SessionLocal() as db:
        owner = db.get(User, owner_user["id"])
    api = _Api(client, _token(owner))
    for name, email, role in (("Dilshod Karimov", "ishlab@atlasmoda.uz", "PRODUCTION_MANAGER"),
                              ("Aziza Tursunova", "ombor@atlasmoda.uz", "WAREHOUSE_MANAGER"),
                              ("Nodira Xoliqova", "sifat@atlasmoda.uz", "QUALITY_MANAGER")):
        api.post("/users", {"full_name": name, "email": email, "password": DEMO_PASSWORD, "role": role})

    today = date.today()
    ago = lambda n: (today - timedelta(days=n)).isoformat()  # noqa: E731
    api("PUT", "/settings/factory", {"overhead_percent": 12, "defect_alert_percent": 3})

    # ---------- ombor va xarid ----------
    mats = {}
    for code, name, mtype, unit, cost, minimum in (
        ("PIKE-220", "Pike mato 220 g/m²", "FABRIC", "METER", 32000, 150),
        ("KUL-180", "Kulirka mato 180 g/m²", "FABRIC", "METER", 26000, 150),
        ("IP-40", "Ip 40/2 (5000 m)", "THREAD", "SPOOL", 18000, 20),
        ("TUGMA-11", "Tugma 11 mm", "BUTTON", "PIECE", 250, 500),
        ("YORLIQ", "To'qima yorliq", "LABEL", "PIECE", 180, 300),
        ("PAKET", "Polietilen paket", "PACKAGING", "PIECE", 350, 300),
    ):
        mats[code] = api.post("/inventory/materials", {"code": code, "name": name, "material_type": mtype, "unit": unit, "unit_cost": cost, "min_stock": minimum})
    loc = api.post("/inventory/locations", {"code": "A-1", "name": "Mato ombori"})
    api.post("/inventory/locations", {"code": "B-1", "name": "Furnitura ombori"})
    fg = api.post("/inventory/locations", {"code": "TM-1", "name": "Tayyor mahsulot ombori"})
    mato = api.post("/suppliers", {"name": "Toshkent Mato Savdo", "contact_person": "Rustam Aliyev", "phone": "+998901112233",
                                   "tax_id": "305123456", "lead_time_days": 5, "payment_terms_days": 15})
    furn = api.post("/suppliers", {"name": "Furnitura Plus", "contact_person": "Kamola Yusupova", "phone": "+998935556677", "lead_time_days": 3})

    def purchase(supplier, lines, receive=True, **extra):
        po = api.post("/purchase-orders", {"supplier_id": supplier["id"], "items": [
            {"material_id": mats[c]["id"], "quantity": q, "unit_price": p} for c, q, p in lines], **extra})
        api.post(f"/purchase-orders/{po['id']}/submit")
        if receive:
            api.post(f"/purchase-orders/{po['id']}/receive", {"location_id": loc["id"], "document_no": f"YX-{po['id']:04d}",
                                                               "lines": [{"item_id": i["id"], "quantity": i["quantity"]} for i in po["lines"]]})
        return po

    purchase(mato, [("PIKE-220", 600, 32000), ("KUL-180", 420, 26000)])
    purchase(furn, [("IP-40", 60, 18000), ("TUGMA-11", 3000, 250), ("YORLIQ", 2000, 180), ("PAKET", 2000, 350)])
    purchase(mato, [("KUL-180", 300, 26500)], receive=False, order_date=ago(9), expected_date=ago(2))  # kechikkan xarid

    # ---------- mahsulotlar va BOM ----------
    products = [p for p in api("GET", "/products") if p["sizes"]]
    polo, tee = products[0], products[1] if len(products) > 1 else products[0]
    for product, fabric, meters, buttons in ((polo, "PIKE-220", 1.4, 3), (tee, "KUL-180", 1.2, 0)):
        bom = [(fabric, "FABRIC", meters, "METER", 5), ("IP-40", "THREAD", 0.03, "SPOOL", 0), ("YORLIQ", "LABEL", 1, "PIECE", 0), ("PAKET", "PACKAGING", 1, "PIECE", 0)]
        if buttons:
            bom.append(("TUGMA-11", "BUTTON", buttons, "PIECE", 2))
        for code, mtype, qty, unit, waste in bom:
            api.post(f"/products/{product['id']}/bom", {"material_id": mats[code]["id"], "material_type": mtype, "material_name": "katalogdan",
                                                         "quantity": qty, "unit": unit, "waste_percent": waste})

    # ---------- resurslar ----------
    lines = {}
    for code, name, stage, cap in (("KS-1", "Kesish sexi", "CUTTING", 1500), ("TK-1", "Tikuv liniyasi 1", "SEWING", 800),
                                   ("TK-2", "Tikuv liniyasi 2", "SEWING", 800), ("PZ-1", "Pardoz va dazmol", "FINISHING", 1200),
                                   ("QD-1", "Qadoqlash", "PACKING", 1500)):
        lines[code] = api.post("/production-lines", {"code": code, "name": name, "stage": stage, "capacity_per_shift": cap})
    day = api.post("/shifts", {"name": "Kunduzgi", "start_time": "08:00", "end_time": "17:00", "break_minutes": 60})
    api.post("/shifts", {"name": "Kechki", "start_time": "17:00", "end_time": "01:00", "break_minutes": 30})
    emp = {}
    for key, name, dept, pos, line, pay_type, rate, norm in (
        ("cut", "Jahongir Ergashev", "CUTTING", "Bichuvchi", "KS-1", "HOURLY", 15000, 300),
        ("s1", "Dilnoza Karimova", "SEWING", "Tikuvchi", "TK-1", "PIECE", 2500, 60),
        ("s2", "Malika Tursunova", "SEWING", "Tikuvchi", "TK-1", "PIECE", 2500, 60),
        ("s3", "Gulnora Saidova", "SEWING", "Tikuvchi", "TK-2", "PIECE", 2500, 60),
        ("fin", "Bobur Nazarov", "FINISHING", "Dazmolchi", "PZ-1", "PIECE", 800, 200),
        ("qc", "Nodira Xoliqova", "QUALITY_CONTROL", "Nazoratchi", None, "MONTHLY", 4500000, 400),
        ("pack", "Sevara Aminova", "PACKING", "Qadoqlovchi", "QD-1", "PIECE", 500, 400),
        ("mech", "Oybek Qodirov", "MAINTENANCE", "Mexanik", None, "MONTHLY", 5000000, None),
    ):
        emp[key] = api.post("/employees", {"full_name": name, "department": dept, "position": pos, "line_id": lines[line]["id"] if line else None,
                                           "shift_id": day["id"], "pay_type": pay_type, "pay_rate": rate, "daily_norm": norm})
    mach = {}
    for code, name, mtype, line, status, interval, last in (
        ("KS-01", "Eastman kesish mashinasi", "CUTTING", "KS-1", "WORKING", 90, ago(20)),
        ("JK-01", "Juki DDL-8700", "LOCKSTITCH", "TK-1", "WORKING", 60, ago(15)),
        ("JK-02", "Juki DDL-8700", "LOCKSTITCH", "TK-1", "WORKING", 60, ago(15)),
        ("OV-01", "Juki MO-6814 overlok", "OVERLOCK", "TK-2", "WORKING", 30, ago(40)),  # texnik xizmat muddati o'tgan
        ("PR-01", "Dazmol presi", "PRESS", "PZ-1", "IDLE", None, None),
    ):
        mach[code] = api.post("/machines", {"code": code, "name": name, "machine_type": mtype, "line_id": lines[line]["id"], "status": status,
                                            "maintenance_interval_days": interval, "last_maintenance_date": last})

    # ---------- mijozlar va buyurtmalar ----------
    cust = [api.post("/customers", {"name": n, "customer_type": "COMPANY", "status": "ACTIVE", "phone": ph, "country": "UZ", "contact_person": cp})
            for n, ph, cp in (("Baraka Savdo MChJ", "+998901000001", "Anvar Qosimov"), ("Orient Textile Group", "+998901000002", "Laylo Hamidova"),
                              ("Samarqand Kiyim Uyi", "+998901000003", "Shoxrux Olimov"))]

    def variant(p, i=0):
        return {"size": p["sizes"][min(i, len(p["sizes"]) - 1)], **({"color": p["colors"][0]} if p["colors"] else {})}

    def issue(order):
        req = api("GET", f"/orders/{order['id']}/materials")
        lines_ = [{"material_id": r["material_id"], "quantity": r["remaining"]} for r in req["lines"] if r["material_id"] and r["remaining"] > 0]
        api.post(f"/orders/{order['id']}/materials/issue", {"lines": lines_})

    def log(wo, stage, good, days, defect=0, reason=None, who=None, machine=None, minutes=None, fabric=None):
        api.post(f"/production/work-orders/{wo['id']}/logs", {
            "stage": stage, "quantity_good": good, "quantity_defect": defect, "defect_reason": reason, "work_date": ago(days),
            "employee_id": emp[who]["id"] if who else None, "machine_id": mach[machine]["id"] if machine else None,
            "duration_minutes": minutes, "fabric_used": fabric})

    # 1) Baraka: to'liq sikl — ishlab chiqarildi, jo'natildi, yetkazildi, to'landi
    o1 = api.post("/orders", {"customer_id": cust[0]["id"], "due_date": (today + timedelta(days=3)).isoformat(), "comment": "Korporativ polo, logotip bilan",
                              "items": [{"product_id": polo["id"], "quantity": 120, **variant(polo, 1)}, {"product_id": polo["id"], "quantity": 80, **variant(polo, 2)}]})
    issue(o1)
    for i, wo in enumerate(api.post(f"/orders/{o1['id']}/work-orders", {"line_id": lines["TK-1"]["id"], "overcut_pct": 3})):
        q = wo["quantity"]
        cut = int(q * 1.03)  # ortiqcha kesish chegarasi (pastga yaxlitlanadi)
        log(wo, "CUTTING", cut, 12 - i, who="cut", machine="KS-01", minutes=240, fabric=round(cut * 1.42, 1))
        log(wo, "SEWING", cut - 2, 10 - i, defect=2, reason="Chok qiyshiq", who="s1" if i == 0 else "s2", machine="JK-01" if i == 0 else "JK-02", minutes=480)
        log(wo, "FINISHING", cut - 2, 8 - i, who="fin", minutes=300)
        log(wo, "QUALITY_CONTROL", q, 7 - i, defect=cut - 2 - q, reason="Dog'", who="qc", minutes=180)
        log(wo, "PACKING", q // 2, 6 - i, who="pack", minutes=120)
        log(wo, "PACKING", q - q // 2, 5 - i, who="pack", minutes=120)
        api.post("/finished-goods/receive", {"work_order_id": wo["id"], "location_id": fg["id"], "quantity": q})
    ship = api("GET", f"/orders/{o1['id']}/shipping")
    sh = api.post("/shipments", {"order_id": o1["id"], "carrier": "O'z transporti", "vehicle_no": "01A777BC", "driver_name": "Botir Rasulov",
                                 "driver_phone": "+998907778899", "planned_date": ago(2),
                                 "items": [{"order_item_id": line["order_item_id"], "quantity": line["remaining"]} for line in ship["lines"]]})
    api.post(f"/shipments/{sh['id']}/ship", {})
    api.post(f"/shipments/{sh['id']}/deliver", {"received_by": "Anvar Qosimov"})
    api.post(f"/orders/{o1['id']}/payment")

    # 2) Orient: ishlab chiqarishda — kesilgan, tikuv davom etmoqda, partiyalar QR bilan
    o2 = api.post("/orders", {"customer_id": cust[1]["id"], "due_date": (today + timedelta(days=9)).isoformat(),
                              "items": [{"product_id": tee["id"], "quantity": 150, **variant(tee, 0)}, {"product_id": tee["id"], "quantity": 150, **variant(tee, 1)}]})
    issue(o2)
    wos2 = api.post(f"/orders/{o2['id']}/work-orders", {"line_id": lines["TK-2"]["id"], "overcut_pct": 2})
    for i, wo in enumerate(wos2):
        log(wo, "CUTTING", 153, 4 - i, who="cut", machine="KS-01", minutes=300, fabric=round(153 * 1.21, 1))
        api.post(f"/production/work-orders/{wo['id']}/units", {"kind": "BUNDLE", "quantity": 80})
        api.post(f"/production/work-orders/{wo['id']}/units", {"kind": "BUNDLE", "quantity": 73})
    log(wos2[0], "SEWING", 70, 2, defect=3, reason="Chok qiyshiq", who="s3", machine="OV-01", minutes=480)
    log(wos2[0], "SEWING", 62, 1, defect=1, reason="Ip uzilgan", who="s1", machine="JK-01", minutes=450)
    log(wos2[0], "FINISHING", 60, 1, who="fin", minutes=240)
    log(wos2[1], "SEWING", 48, 1, who="s2", machine="JK-02", minutes=420)

    # 3) Samarqand: yangi, material yetishmaydi (xarid qilish tugmasini ko'rsatish uchun)
    api.post("/orders", {"customer_id": cust[2]["id"], "due_date": (today + timedelta(days=21)).isoformat(),
                         "items": [{"product_id": polo["id"], "quantity": 500, **variant(polo, 0)}]})

    # ---------- kamera / AI ----------
    cam = api.post("/vision/devices", {"code": "CAM-01", "name": "Tikuv liniyasi 2 kamerasi", "kind": "CAMERA", "stage": "SEWING",
                                       "line_id": lines["TK-2"]["id"], "machine_id": mach["OV-01"]["id"]})
    api("PATCH", f"/vision/devices/{cam['id']}", {"work_order_id": wos2[1]["id"]})
    api.post("/vision/devices", {"code": "EDGE-01", "name": "Kesish sexi AI qutisi", "kind": "EDGE", "stage": "CUTTING", "line_id": lines["KS-1"]["id"]})
    api.post("/vision/rules", {"event_type": "COUNT", "action": "AUTO_APPLY", "min_confidence": 0.85})
    api.post("/vision/rules", {"event_type": "DEFECT", "action": "REVIEW", "alert_threshold": 10, "alert_window_minutes": 60})
    r = client.post("/api/v1/vision/ingest", headers={"X-Device-Key": cam["api_key"]}, json={"events": [
        {"event_type": "COUNT", "external_id": "demo-1", "quantity": 12, "confidence": 0.94},
        {"event_type": "COUNT", "external_id": "demo-2", "quantity": 9, "confidence": 0.91},
        {"event_type": "COUNT", "external_id": "demo-3", "quantity": 11, "confidence": 0.62},
        {"event_type": "DEFECT", "external_id": "demo-4", "quantity": 1, "confidence": 0.88, "defect_reason": "Mato teshik"},
    ]})
    if r.status_code != 200:
        raise RuntimeError(f"vision ingest → {r.status_code}: {r.text[:200]}")
    return True


if __name__ == "__main__":
    print("Demo ish oqimi qo'shildi" if seed_workflow_demo() else "Qo'shilmadi (allaqachon bor yoki Atlas Moda topilmadi)")
