"""Ochiq deploy demo katalogi: to'qima brendlar, haqiqiy brend nomlari yo'q, rasmlar frontend/public da bor."""

import re

from scripts.public_demo import FRONTEND_PUBLIC, seed_public
from tests.conftest import API

REAL_BRANDS = re.compile(
    r"Zara|Inditex|Ralph|Lauren|Loro|Piana|Uniqlo|AIRism|HEATTECH|LifeWear|Levi|\b501\b|Lacoste|L\.12|Benetton|H&M|Fast Retailing",
    re.I,
)


def test_seed_public_is_idempotent_and_brand_free(client):
    assert seed_public() == 8
    assert seed_public() == 0  # qayta ishga tushirish — dublikat yo'q

    factories = client.get(f"{API}/store/factories").json()
    assert len(factories) == 8
    for card in factories:
        detail = client.get(f"{API}/store/factories/{card['id']}").json()
        assert not REAL_BRANDS.search(str(detail)), detail["name"]
        urls = [detail["logo_url"], detail["cover_url"]]
        urls += [u for p in detail["products"] for u in (p["image_url"], p["model_image_url"])]
        for url in urls:
            assert url.startswith("/media/demo/")
            assert (FRONTEND_PUBLIC / url.lstrip("/")).is_file(), url


def test_generated_assets_are_brand_free():
    for svg in (FRONTEND_PUBLIC / "media" / "demo").rglob("*.svg"):
        assert not REAL_BRANDS.search(svg.read_text(encoding="utf-8")), svg.name


def test_database_url_accepts_neon_scheme():
    from app.core.config import Settings

    neon = "postgres://u:p@ep-x.neon.tech/db?sslmode=require"
    assert Settings(DATABASE_URL=neon).DATABASE_URL == "postgresql+psycopg://u:p@ep-x.neon.tech/db?sslmode=require"
    assert Settings(DATABASE_URL="sqlite:///x.db").DATABASE_URL == "sqlite:///x.db"
