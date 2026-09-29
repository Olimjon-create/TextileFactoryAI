from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services import assistant_service, telegram_service
from tests.conftest import ADMIN_EMAIL, API, auth, register_owner
from tests.test_store import product, shop
from tests.test_telegram_bot import bot, hook, message


def ask(client, shop, **extra):
    body = {"customer_name": "Aziz", "customer_phone": "+998 90 123 45 67", "question": "Bu futbolka paxtami?", **extra}
    return client.post(f"{API}/store/factories/{shop['factory_id']}/questions", json=body)


def test_question_saved_and_managed(client, shop):
    assert ask(client, shop, product_id=shop["polo"]["id"]).status_code == 204
    assert ask(client, shop).status_code == 204
    owner = shop["owner"]
    page = client.get(f"{API}/questions", headers=owner).json()
    assert page["total"] == 2 and page["new_count"] == 2
    assert {q["product_name"] for q in page["items"]} == {shop["polo"]["name"], None}

    notes = client.get(f"{API}/notifications", headers=owner).json()["items"]
    assert sum(1 for n in notes if n["type"] == "question") == 2

    qid = page["items"][0]["id"]
    r = client.patch(f"{API}/questions/{qid}", headers=owner, json={"status": "ANSWERED"})
    assert r.status_code == 200 and r.json()["answered_at"]
    page = client.get(f"{API}/questions", headers=owner).json()
    assert page["new_count"] == 1 and page["items"][0]["status"] == "NEW"
    assert client.get(f"{API}/questions", headers=owner, params={"status": "ANSWERED"}).json()["total"] == 1

    other, _ = register_owner(client, "other@q.uz", "Boshqa")
    assert client.get(f"{API}/questions", headers=other).json()["total"] == 0
    assert client.patch(f"{API}/questions/{qid}", headers=other, json={"status": "NEW"}).status_code == 404
    assert client.get(f"{API}/questions", headers=auth(client, ADMIN_EMAIL)).json()["total"] == 2


def test_question_validation(client, shop):
    other, _ = register_owner(client, "other@q.uz", "Boshqa")
    foreign = product(client, other, "FX-1")
    assert ask(client, shop, product_id=foreign["id"]).status_code == 404
    assert ask(client, shop, question="?").status_code == 422
    assert ask(client, shop, customer_phone="abc").status_code == 422
    assert client.post(f"{API}/store/factories/99999/questions",
                       json={"customer_name": "Aziz", "customer_phone": "+998901234567", "question": "Salom, savol bor"}).status_code == 404


def test_question_sent_to_factory_telegram(client, shop, bot):
    from app.core.database import SessionLocal
    from app.models import Factory
    with SessionLocal() as db:
        db.get(Factory, shop["factory_id"]).telegram_chat_id = "77"
        db.commit()
    ask(client, shop, product_id=shop["tee"]["id"])
    sent = bot["sent"][-1]
    assert sent["chat_id"] == "77" and "Mijoz savoli" in sent["text"] and shop["tee"]["name"] in sent["text"]


@pytest.fixture()
def claude(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test")
    assistant_service._cache.clear()
    calls = []
    state = {"text": "", "stop_reason": "end_turn"}

    def fake_call(system, messages):
        calls.append({"system": system, "messages": messages})
        return SimpleNamespace(stop_reason=state["stop_reason"], content=[SimpleNamespace(type="text", text=state["text"])])

    monkeypatch.setattr(assistant_service, "_call", fake_call)
    yield {"calls": calls, "state": state}
    assistant_service._cache.clear()


def test_assistant_disabled_without_key(client, shop):
    assert client.get(f"{API}/store/assistant").json() == {"enabled": False}
    r = client.post(f"{API}/store/assistant", json={"messages": [{"role": "user", "content": "Salom"}]})
    assert r.status_code == 503


def test_assistant_answers_with_products(client, shop, claude):
    assert client.get(f"{API}/store/assistant").json() == {"enabled": True}
    polo = shop["polo"]["id"]
    claude["state"]["text"] = f"Sizga mos: {shop['polo']['name']} [[{polo}]] va noma'lum [[99999]]. Ikkinchisi [[{polo}]]."
    r = client.post(f"{API}/store/assistant", headers={"Accept-Language": "ru"}, json={"messages": [
        {"role": "assistant", "content": "Salom!"},
        {"role": "user", "content": "Polo bormi?"},
    ]})
    assert r.status_code == 200
    body = r.json()
    assert "[[" not in body["reply"] and shop["polo"]["name"] in body["reply"]
    assert [p["id"] for p in body["products"]] == [polo]
    call = claude["calls"][-1]
    assert call["messages"] == [{"role": "user", "content": "Polo bormi?"}]
    catalog = call["system"][1]["text"]
    assert f"[{polo}]" in catalog and "Alpha Textile" in catalog and shop["draft"]["name"] not in catalog
    assert call["system"][1]["cache_control"] == {"type": "ephemeral"}
    assert "Russian" in call["system"][2]["text"]


def test_assistant_refusal_and_validation(client, shop, claude):
    claude["state"]["stop_reason"] = "refusal"
    r = client.post(f"{API}/store/assistant", json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 200 and r.json()["products"] == []
    assert client.post(f"{API}/store/assistant", json={"messages": [{"role": "assistant", "content": "x"}]}).status_code == 422
    assert client.post(f"{API}/store/assistant", json={"messages": []}).status_code == 422
    assert client.post(f"{API}/store/assistant", json={"messages": [{"role": "user", "content": "x" * 2001}]}).status_code == 422


def test_model_options():
    assert assistant_service._model_options("claude-opus-5-5") == {
        "output_config": {"effort": "low"}, "betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    assert assistant_service._model_options("claude-haiku-4-5") == {}


def test_telegram_free_text_uses_assistant(client, shop, bot, claude):
    claude["state"]["text"] = f"Ha, bor: {shop['tee']['name']} [[{shop['tee']['id']}]]"
    hook(client, message("Ko'ylak bormi?"))
    sent = bot["sent"][-1]
    assert shop["tee"]["name"] in sent["text"] and "[[" not in sent["text"]
    first = sent["reply_markup"]["inline_keyboard"][0][0]
    assert first["web_app"]["url"].endswith(f"/store/factories/{shop['factory_id']}?product={shop['tee']['id']}")
    assert claude["calls"][-1]["messages"] == [{"role": "user", "content": "Ko'ylak bormi?"}]
    assert any(method == "sendChatAction" for method, _ in bot["calls"])
