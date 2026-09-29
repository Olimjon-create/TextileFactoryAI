from app.core.database import SessionLocal
from app.core.security import is_weak_password
from app.models import ProductStockMovement, WarehouseLocation
from app.models.logistics import ProductMovementType
from tests.conftest import ADMIN_EMAIL, API, PASSWORD, auth
from tests.test_store import shop


def test_is_weak_password():
    assert is_weak_password("Admin12345")
    assert is_weak_password("short1A!")
    assert is_weak_password("aaaaaaaaaaaa")
    assert is_weak_password("aziz-rahimov-2026", "aziz@mail.uz")
    assert not is_weak_password("Kx9#mPq2vLz!")


def test_login_marks_weak_and_change_clears(client):
    headers = auth(client, ADMIN_EMAIL)
    me = client.get(f"{API}/auth/me", headers=headers).json()
    assert me["password_weak"] is is_weak_password(PASSWORD, ADMIN_EMAIL)
    r = client.post(f"{API}/auth/change-password", headers=headers,
                    json={"current_password": PASSWORD, "new_password": "Kx9#mPq2vLz!"})
    assert r.status_code == 204
    assert client.get(f"{API}/auth/me", headers=headers).json()["password_weak"] is False
    r = client.post(f"{API}/auth/change-password", headers=headers,
                    json={"current_password": "Kx9#mPq2vLz!", "new_password": "Admin12345"})
    assert r.status_code == 204
    assert client.get(f"{API}/auth/me", headers=headers).json()["password_weak"] is True


def test_store_shows_finished_goods_stock(client, shop):
    with SessionLocal() as db:
        loc = WarehouseLocation(factory_id=shop["factory_id"], code="TM-1", name="Tayyor")
        db.add(loc)
        db.flush()
        for qty in (10, -3):
            db.add(ProductStockMovement(factory_id=shop["factory_id"], product_id=shop["polo"]["id"], location_id=loc.id,
                                        movement_type=ProductMovementType.RECEIPT if qty > 0 else ProductMovementType.ADJUSTMENT,
                                        quantity=qty))
        db.commit()
    detail = client.get(f"{API}/store/factories/{shop['factory_id']}").json()
    stock = {p["id"]: p["in_stock"] for p in detail["products"]}
    assert stock[shop["polo"]["id"]] == 7 and stock[shop["tee"]["id"]] == 0
    items = client.get(f"{API}/store/products").json()["items"]
    assert {p["id"]: p["in_stock"] for p in items}[shop["polo"]["id"]] == 7
