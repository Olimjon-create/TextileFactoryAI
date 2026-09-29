"""Ombor: materiallar, joylar, harakatlar jurnali, qoldiq qoidalari, BOM bog'lanishi va audit log."""

import pytest

from tests.conftest import ADMIN_EMAIL, API, add_user, auth, register_owner

INV = f"{API}/inventory"


@pytest.fixture()
def shop(client):
    owner, factory_id = register_owner(client, "owner@f.uz", "Alfa Tekstil")
    fabric = client.post(
        f"{INV}/materials",
        headers=owner,
        json={"code": "fab-01", "name": "Paxta trikotaj", "material_type": "FABRIC", "unit": "METER", "min_stock": 50, "unit_cost": 25000},
    ).json()
    main = client.post(f"{INV}/locations", headers=owner, json={"code": "a-1", "name": "Mato ombori"}).json()
    spare = client.post(f"{INV}/locations", headers=owner, json={"code": "b-1", "name": "Sex yonidagi ombor"}).json()
    return {"owner": owner, "factory_id": factory_id, "fabric": fabric, "main": main, "spare": spare}


def move(client, headers, **body):
    return client.post(f"{INV}/movements", headers=headers, json=body)


def stock(client, headers, material_id):
    return client.get(f"{INV}/materials/{material_id}", headers=headers).json()


def test_material_created_normalized(shop):
    assert shop["fabric"]["code"] == "FAB-01"
    assert shop["fabric"]["stock"] == 0
    assert shop["main"]["code"] == "A-1"


def test_receipt_issue_and_negative_stock_guard(client, shop):
    o, fab, loc = shop["owner"], shop["fabric"]["id"], shop["main"]["id"]
    r = move(client, o, movement_type="RECEIPT", material_id=fab, location_id=loc, quantity=120.5, unit_cost=26000, document_no="NAK-7")
    assert r.status_code == 201, r.text
    assert r.json()[0]["quantity"] == 120.5
    detail = stock(client, o, fab)
    assert detail["stock"] == 120.5
    assert detail["unit_cost"] == 26000  # oxirgi xarid narxi
    assert detail["stock_value"] == 120.5 * 26000

    # Qoldiqdan ko'p chiqim — rad etiladi, qoldiq o'zgarmaydi
    r = move(client, o, movement_type="ISSUE", material_id=fab, location_id=loc, quantity=200)
    assert r.status_code == 422 and "yetarli qoldiq" in r.json()["detail"]
    assert move(client, o, movement_type="ISSUE", material_id=fab, location_id=loc, quantity=100).status_code == 201
    assert stock(client, o, fab)["stock"] == 20.5
    assert stock(client, o, fab)["is_low"] is True  # min_stock = 50


def test_transfer_moves_between_locations(client, shop):
    o, fab = shop["owner"], shop["fabric"]["id"]
    move(client, o, movement_type="RECEIPT", material_id=fab, location_id=shop["main"]["id"], quantity=100)
    r = move(client, o, movement_type="TRANSFER", material_id=fab, location_id=shop["main"]["id"], to_location_id=shop["spare"]["id"], quantity=30)
    assert r.status_code == 201, r.text
    rows = r.json()
    assert [x["movement_type"] for x in rows] == ["TRANSFER_OUT", "TRANSFER_IN"]
    assert rows[0]["transfer_group"] == rows[1]["transfer_group"]
    detail = stock(client, o, fab)
    assert detail["stock"] == 100
    assert {x["location_code"]: x["quantity"] for x in detail["locations"]} == {"A-1": 70, "B-1": 30}
    # Bir joyning o'ziga ko'chirib bo'lmaydi
    r = move(client, o, movement_type="TRANSFER", material_id=fab, location_id=shop["main"]["id"], to_location_id=shop["main"]["id"], quantity=1)
    assert r.status_code == 422


def test_adjustment_sets_counted_quantity(client, shop):
    o, fab, loc = shop["owner"], shop["fabric"]["id"], shop["main"]["id"]
    move(client, o, movement_type="RECEIPT", material_id=fab, location_id=loc, quantity=100)
    r = move(client, o, movement_type="ADJUSTMENT", material_id=fab, location_id=loc, quantity=97.25, note="Oylik sanoq")
    assert r.status_code == 201
    assert r.json()[0]["quantity"] == -2.75
    assert stock(client, o, fab)["stock"] == 97.25
    # Farq yo'q — tuzatish kerak emas
    assert move(client, o, movement_type="ADJUSTMENT", material_id=fab, location_id=loc, quantity=97.25).status_code == 422


def test_movements_journal_filters_and_pagination(client, shop):
    o, fab, loc = shop["owner"], shop["fabric"]["id"], shop["main"]["id"]
    for i in range(3):
        move(client, o, movement_type="RECEIPT", material_id=fab, location_id=loc, quantity=10, document_no=f"NAK-{i}")
    move(client, o, movement_type="ISSUE", material_id=fab, location_id=loc, quantity=5)
    page = client.get(f"{INV}/movements", headers=o, params={"limit": 2}).json()
    assert page["total"] == 4 and len(page["items"]) == 2
    assert page["items"][0]["movement_type"] == "ISSUE"  # yangilari birinchi
    assert page["items"][0]["created_by_name"]
    receipts = client.get(f"{INV}/movements", headers=o, params={"movement_type": "RECEIPT"}).json()
    assert receipts["total"] == 3
    found = client.get(f"{INV}/movements", headers=o, params={"search": "NAK-2"}).json()
    assert found["total"] == 1


def test_material_list_stock_filters_and_summary(client, shop):
    o = shop["owner"]
    thread = client.post(f"{INV}/materials", headers=o, json={"code": "THR-1", "name": "Ip oq", "material_type": "THREAD", "unit": "SPOOL"}).json()
    move(client, o, movement_type="RECEIPT", material_id=thread["id"], location_id=shop["main"]["id"], quantity=40, unit_cost=5000)
    assert client.get(f"{INV}/materials", headers=o, params={"stock_state": "out"}).json()["total"] == 1  # mato
    assert client.get(f"{INV}/materials", headers=o, params={"stock_state": "low"}).json()["total"] == 1
    assert client.get(f"{INV}/materials", headers=o, params={"stock_state": "in"}).json()["items"][0]["code"] == "THR-1"
    assert client.get(f"{INV}/materials", headers=o, params={"material_type": "THREAD"}).json()["total"] == 1
    s = client.get(f"{INV}/summary", headers=o).json()
    assert s["materials_count"] == 2 and s["low_stock_count"] == 1 and s["out_of_stock_count"] == 1
    assert s["stock_value"] == 40 * 5000
    assert s["movements_today"] == 1 and s["receipts_30d"] == 1


def test_history_protects_delete_and_unit(client, shop):
    o, fab, loc = shop["owner"], shop["fabric"]["id"], shop["main"]["id"]
    move(client, o, movement_type="RECEIPT", material_id=fab, location_id=loc, quantity=5)
    assert client.delete(f"{INV}/materials/{fab}", headers=o).status_code == 409
    assert client.delete(f"{INV}/locations/{loc}", headers=o).status_code == 409
    assert client.patch(f"{INV}/materials/{fab}", headers=o, json={"unit": "KILOGRAM"}).status_code == 409
    # Nofaol qilish mumkin, nofaol materialga kirim qilib bo'lmaydi
    assert client.patch(f"{INV}/materials/{fab}", headers=o, json={"is_active": False}).status_code == 200
    assert move(client, o, movement_type="RECEIPT", material_id=fab, location_id=loc, quantity=1).status_code == 422
    # Tarixi yo'q material o'chadi
    tmp = client.post(f"{INV}/materials", headers=o, json={"code": "TMP", "name": "Vaqtincha", "material_type": "OTHER", "unit": "PIECE"}).json()
    assert client.delete(f"{INV}/materials/{tmp['id']}", headers=o).status_code == 204


def test_duplicate_codes(client, shop):
    o = shop["owner"]
    r = client.post(f"{INV}/materials", headers=o, json={"code": "FAB-01", "name": "Takror", "material_type": "FABRIC", "unit": "METER"})
    assert r.status_code == 409
    assert client.post(f"{INV}/locations", headers=o, json={"code": "A-1", "name": "Takror"}).status_code == 409


def test_roles_and_factory_isolation(client, shop):
    o, fab = shop["owner"], shop["fabric"]["id"]
    worker = add_user(client, o, "w@f.uz", "WORKER")
    quality = add_user(client, o, "q@f.uz", "QUALITY_MANAGER")
    keeper = add_user(client, o, "k@f.uz", "WAREHOUSE_MANAGER")
    assert client.get(f"{INV}/materials", headers=worker).status_code == 403
    assert client.get(f"{INV}/materials", headers=quality).status_code == 200  # ko'rish mumkin
    assert move(client, quality, movement_type="RECEIPT", material_id=fab, location_id=shop["main"]["id"], quantity=1).status_code == 403
    assert move(client, keeper, movement_type="RECEIPT", material_id=fab, location_id=shop["main"]["id"], quantity=1).status_code == 201

    other, _ = register_owner(client, "other@f.uz", "Beta")
    assert client.get(f"{INV}/materials", headers=other).json()["total"] == 0
    assert client.get(f"{INV}/materials/{fab}", headers=other).status_code == 404
    assert move(client, other, movement_type="RECEIPT", material_id=fab, location_id=shop["main"]["id"], quantity=1).status_code == 404
    # Boshqa zavodning joyiga o'z materialini qo'yib bo'lmaydi
    own = client.post(f"{INV}/materials", headers=other, json={"code": "X", "name": "Beta mato", "material_type": "FABRIC", "unit": "METER"}).json()
    assert move(client, other, movement_type="RECEIPT", material_id=own["id"], location_id=shop["main"]["id"], quantity=1).status_code == 404

    admin = auth(client, ADMIN_EMAIL)
    assert client.get(f"{INV}/materials", headers=admin).json()["total"] == 2
    assert client.get(f"{INV}/materials", headers=admin, params={"factory_id": shop["factory_id"]}).json()["total"] == 1
    r = client.post(f"{INV}/materials", headers=admin, json={"code": "Z", "name": "Admin", "material_type": "OTHER", "unit": "PIECE"})
    assert r.status_code == 422  # SUPER_ADMIN fabrikani tanlashi shart


def test_bom_links_catalog_material(client, shop):
    o, fab = shop["owner"], shop["fabric"]
    product = client.post(f"{API}/products", headers=o, json={"name": "Futbolka", "code": "TS-1", "category": "Futbolka"}).json()
    r = client.post(
        f"{API}/products/{product['id']}/bom",
        headers=o,
        json={"material_id": fab["id"], "material_type": "OTHER", "material_name": "noto'g'ri nom", "quantity": 1.2, "unit": "PIECE"},
    )
    assert r.status_code == 201, r.text
    item = r.json()
    # Nom, tur va birlik katalogdan olinadi
    assert (item["material_name"], item["material_type"], item["unit"], item["material_code"]) == ("Paxta trikotaj", "FABRIC", "METER", "FAB-01")
    assert stock(client, o, fab["id"])["bom_usage_count"] == 1

    # Katalogda nom o'zgarsa — BOM ham yangilanadi (bir ma'lumot bir joyda)
    client.patch(f"{INV}/materials/{fab['id']}", headers=o, json={"name": "Paxta trikotaj 180 g/m²"})
    bom = client.get(f"{API}/products/{product['id']}", headers=o).json()["bom_items"]
    assert bom[0]["material_name"] == "Paxta trikotaj 180 g/m²"

    # Boshqa zavod materiali BOM'ga qo'shilmaydi
    other, _ = register_owner(client, "o2@f.uz", "Gamma")
    foreign = client.post(f"{INV}/materials", headers=other, json={"code": "F", "name": "Begona", "material_type": "FABRIC", "unit": "METER"}).json()
    r = client.post(f"{API}/products/{product['id']}/bom", headers=o, json={"material_id": foreign["id"], "material_type": "FABRIC", "material_name": "Begona", "quantity": 1, "unit": "METER"})
    assert r.status_code == 422


def test_audit_log_records_and_permissions(client, shop):
    o, fab, loc = shop["owner"], shop["fabric"]["id"], shop["main"]["id"]
    move(client, o, movement_type="RECEIPT", material_id=fab, location_id=loc, quantity=10)
    client.patch(f"{INV}/materials/{fab}", headers=o, json={"min_stock": 5})
    logs = client.get(f"{API}/audit-logs", headers=o).json()
    actions = [x["action"] for x in logs["items"]]
    assert actions[:2] == ["UPDATE", "STOCK"]  # yangilari birinchi
    assert logs["items"][0]["changes"] == {"min_stock": [50.0, 5.0]}
    assert logs["items"][0]["user_name"]
    only_stock = client.get(f"{API}/audit-logs", headers=o, params={"entity": "stock_movement"}).json()
    assert only_stock["total"] == 1 and "FAB-01" in only_stock["items"][0]["summary"]

    keeper = add_user(client, o, "k2@f.uz", "WAREHOUSE_MANAGER")
    assert client.get(f"{API}/audit-logs", headers=keeper).status_code == 403
    other, _ = register_owner(client, "o3@f.uz", "Delta")
    assert client.get(f"{API}/audit-logs", headers=other).json()["total"] == 0
