import re
import time
from functools import lru_cache

import anthropic
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.i18n import t
from app.schemas.store import StoreCatalogProduct
from app.services import store_service

CATALOG_TTL = 300
MAX_PRODUCTS_IN_REPLY = 4
MARKER = re.compile(r"\s*\[\[(\d+)\]\]")
LANG_NAMES = {"uz": "Uzbek (Latin script)", "ru": "Russian", "en": "English"}

RULES = """You are the shopping assistant of TextileCore, an online catalog where customers order clothing directly from garment factories.

Answer only questions about the catalog below: products, categories, sizes, colors, prices, factories, and how ordering works. Politely decline anything unrelated in one sentence.

Use only facts from the catalog. Never invent products, prices, sizes, colors, stock levels, delivery times or discounts. If the customer asks about something the catalog does not contain (delivery terms, stock, fabric details not listed, custom tailoring, wholesale prices), say that the factory will confirm it and suggest the "Savol berish" (Ask a question) button on the factory page.

When you recommend products, recommend at most 4 and write the marker [[ID]] immediately after each product name, for example: Oversize paxta futbolka [[12]]. The website turns these markers into product cards, so do not repeat prices or links for marked products unless the customer asked about price.

How ordering works: open the product, choose size, color and quantity, add it to the cart and pay by card. The factory then contacts the customer by phone about delivery.

Reply in the language of the customer's latest message (Uzbek Latin, Russian or English). Keep replies short: two to five sentences or a short list. Write plain text without Markdown formatting. Prices are in Uzbek so'm."""

_cache: dict[str, tuple[float, str, dict[int, StoreCatalogProduct]]] = {}


def enabled() -> bool:
    return settings.assistant_enabled


@lru_cache(maxsize=1)
def _client(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key, timeout=25.0, max_retries=1)


def _catalog(db: Session) -> tuple[str, dict[int, StoreCatalogProduct]]:
    cached = _cache.get("catalog")
    if cached and time.monotonic() - cached[0] < CATALOG_TTL:
        return cached[1], cached[2]
    page = store_service.list_products(db, sort="new", limit=500)
    products = {p.id: p for p in page.items}
    lines = []
    for p in page.items:
        parts = [f"[{p.id}] {p.name}", f"category: {p.category}", f"factory: {p.factory_name}", f"price: {p.price:,.0f} so'm".replace(",", " ")]
        if p.sizes:
            parts.append("sizes: " + ", ".join(p.sizes))
        if p.colors:
            parts.append("colors: " + ", ".join(p.colors))
        if p.description:
            parts.append("description: " + p.description.replace("\n", " ")[:300])
        lines.append(" | ".join(parts))
    text = "CATALOG (id, name, details):\n" + "\n".join(lines) if lines else "CATALOG: the catalog is currently empty."
    _cache["catalog"] = (time.monotonic(), text, products)
    return text, products


def _model_options(model: str) -> dict:
    options: dict = {}
    if model.startswith(("claude-opus-5", "claude-fable-5", "claude-sonnet-5")):
        options["output_config"] = {"effort": "low"}
    if model.startswith(("claude-opus-5", "claude-fable-5")) or model == "claude-sonnet-5-5":
        options["betas"] = ["server-side-fallback-2026-07-01"]
        options["fallbacks"] = "default"
    return options


def _call(system: list[dict], messages: list[dict]):
    model = settings.ASSISTANT_MODEL
    return _client(settings.ANTHROPIC_API_KEY.strip()).beta.messages.create(
        model=model, max_tokens=4096, system=system, messages=messages, **_model_options(model),
    )


def ask(db: Session, messages: list[dict], lang: str) -> tuple[str, list[StoreCatalogProduct]]:
    if not enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, t("Yordamchi hozircha o'chirilgan"))
    catalog, products = _catalog(db)
    system = [
        {"type": "text", "text": RULES},
        {"type": "text", "text": catalog, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": f"The website is currently shown in {LANG_NAMES.get(lang, 'Uzbek (Latin script)')}."},
    ]
    try:
        response = _call(system, messages)
    except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as exc:
        print("assistant:", type(exc).__name__, getattr(exc, "message", exc))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, t("Yordamchi hozir javob bera olmadi, birozdan keyin urinib ko'ring"))
    if response.stop_reason == "refusal":
        return t("Kechirasiz, bu savolga javob bera olmayman. Mahsulotlar haqida so'rang."), []
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    ids: list[int] = []
    for match in MARKER.finditer(text):
        pid = int(match.group(1))
        if pid in products and pid not in ids:
            ids.append(pid)
    reply = MARKER.sub("", text).strip()
    if not reply:
        reply = t("Kechirasiz, javob tayyorlay olmadim. Savolni boshqacha yozib ko'ring.")
    return reply, [products[i] for i in ids[:MAX_PRODUCTS_IN_REPLY]]
