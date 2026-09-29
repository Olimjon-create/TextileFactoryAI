from datetime import date, timedelta

from tests.conftest import API, register_owner


def setup_stock(client):
    owner, factory_id = register_owner(client, "owner@w.uz", "Ombor Tekstil")
    post = lambda url, body: client.post(f"{API}{url}", headers=owner, json=body)  # noqa: E731
    fab = post("/inventory/materials", {"code": "FAB", "name": "Pike", "material_type": "FABRIC", "unit": "METER"}).json()
    btn = post("/inventory/materials", {"code": "BTN", "name": "Tugma", "material_type": "BUTTON", "unit": "PIECE"}).json()
    idle = post("/inventory/materials", {"code": "OLD", "name": "Eski ip", "material_type": "THREAD", "unit": "SPOOL"}).json()
    a = post("/inventory/locations", {"code": "A-1", "name": "Mato"}).json()
    b = post("/inventory/locations", {"code": "B-1", "name": "Zaxira"}).json()
    mv = lambda body: post("/inventory/movements", body)  # noqa: E731
    assert mv({"movement_type": "RECEIPT", "material_id": fab["id"], "location_id": a["id"], "quantity": 100, "unit_cost": 20000}).status_code == 201
    assert mv({"movement_type": "ISSUE", "material_id": fab["id"], "location_id": a["id"], "quantity": 30}).status_code == 201
    assert mv({"movement_type": "WRITE_OFF", "material_id": fab["id"], "location_id": a["id"], "quantity": 5}).status_code == 201
    assert mv({"movement_type": "TRANSFER", "material_id": fab["id"], "location_id": a["id"], "to_location_id": b["id"], "quantity": 10}).status_code == 201
    assert mv({"movement_type": "ADJUSTMENT", "material_id": fab["id"], "location_id": b["id"], "quantity": 12}).status_code == 201
    assert mv({"movement_type": "RECEIPT", "material_id": btn["id"], "location_id": a["id"], "quantity": 500}).status_code == 201
    return owner, factory_id, fab, btn, idle


def report(client, headers, **params):
    today = date.today()
    params = {"date_from": today.isoformat(), "date_to": today.isoformat(), **params}
    return client.get(f"{API}/inventory/reports/turnover", headers=headers, params=params)


def test_turnover_for_today(client):
    owner, _, fab, btn, idle = setup_stock(client)
    r = report(client, owner)
    assert r.status_code == 200
    data = r.json()
    rows = {row["code"]: row for row in data["rows"]}
    f = rows["FAB"]
    assert (f["opening"], f["receipts"], f["issues"], f["write_offs"], f["adjustments"], f["closing"]) == (0, 100, 30, 5, 2, 67)
    assert f["receipts_value"] == 2_000_000 and f["issues_value"] == 600_000 and f["closing_value"] == 67 * 20000
    assert rows["BTN"]["closing"] == 500 and rows["BTN"]["closing_value"] is None
    assert rows["OLD"]["closing"] == 0 and rows["OLD"]["last_movement_at"] is None
    assert f["last_movement_at"] is not None
    totals = data["totals"]
    assert totals["closing_value"] == 67 * 20000 and totals["without_cost"] == 1
    assert [t["material_type"] for t in data["by_type"]] == ["FABRIC", "BUTTON"]


def test_turnover_later_period_uses_opening(client):
    owner, *_ = setup_stock(client)
    later = date.today() + timedelta(days=1)
    rows = {row["code"]: row for row in report(client, owner, date_from=later.isoformat(), date_to=(later + timedelta(days=30)).isoformat()).json()["rows"]}
    assert rows["FAB"]["opening"] == 67 and rows["FAB"]["receipts"] == 0 and rows["FAB"]["closing"] == 67


def test_turnover_filters_and_access(client):
    owner, *_ = setup_stock(client)
    only = report(client, owner, material_type="BUTTON").json()["rows"]
    assert [r["code"] for r in only] == ["BTN"]
    other, _ = register_owner(client, "other@w.uz", "Boshqa")
    assert report(client, other).json()["rows"] == []
    today = date.today()
    assert report(client, owner, date_from=today.isoformat(), date_to=(today - timedelta(days=1)).isoformat()).status_code == 422
    assert report(client, owner, date_from=(today - timedelta(days=2000)).isoformat()).status_code == 422
