import gzip
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import Engine

from app.core.config import settings
from app.core.database import Base

BUCKET = "backups"
BATCH = 500
KEEP = 14
SKIP_TABLES = {"rate_limit_hits"}


def snapshot(source: Engine, path: Path) -> int:
    target = create_engine(f"sqlite:///{path}")
    total = 0
    try:
        Base.metadata.create_all(target)
        with source.connect() as src, target.begin() as dst:
            existing = set(inspect(src).get_table_names())
            for table in Base.metadata.sorted_tables:
                if table.name not in existing or table.name in SKIP_TABLES:
                    continue
                rows = [dict(r._mapping) for r in src.execute(select(table))]
                for i in range(0, len(rows), BATCH):
                    dst.execute(table.insert(), rows[i : i + BATCH])
                total += len(rows)
            dst.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
            if "alembic_version" in existing:
                version = src.execute(text("SELECT version_num FROM alembic_version")).scalar()
                dst.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": version})
    finally:
        target.dispose()
    return total


def _headers(content_type: str | None = "application/json") -> dict:
    key = settings.SUPABASE_SECRET_KEY.strip()
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _storage(path: str) -> str:
    return f"{settings.SUPABASE_URL.strip().rstrip('/')}/storage/v1/{path}"


def _ensure_bucket() -> None:
    r = requests.get(_storage(f"bucket/{BUCKET}"), headers=_headers(None), timeout=15)
    if r.status_code == 200:
        if r.json().get("public"):
            raise RuntimeError(f"'{BUCKET}' bucket ochiq (public) — zaxira yuklanmadi")
        return
    r = requests.post(_storage("bucket"), headers=_headers(), json={"id": BUCKET, "name": BUCKET, "public": False}, timeout=15)
    if r.status_code >= 300 and "already exists" not in r.text.lower():
        raise RuntimeError(f"Bucket yaratilmadi ({r.status_code}): {r.text[:200]}")


def _prune() -> int:
    r = requests.post(_storage(f"object/list/{BUCKET}"), headers=_headers(),
                      json={"prefix": "", "limit": 1000, "sortBy": {"column": "name", "order": "asc"}}, timeout=15)
    r.raise_for_status()
    names = sorted(o["name"] for o in r.json() if o.get("name", "").startswith("textilecore-"))
    old = names[:-KEEP]
    if old:
        requests.delete(_storage(f"object/{BUCKET}"), headers=_headers(), json={"prefixes": old}, timeout=15).raise_for_status()
    return len(old)


def cloud_backup(source: Engine) -> dict:
    if not settings.supabase_storage_enabled:
        return {"skipped": "supabase storage sozlanmagan"}
    _ensure_bucket()
    name = f"textilecore-{datetime.now(timezone.utc):%Y%m%d-%H%M}.db.gz"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "snapshot.db"
        rows = snapshot(source, path)
        data = gzip.compress(path.read_bytes())
    r = requests.post(_storage(f"object/{BUCKET}/{name}"), data=data,
                      headers={**_headers("application/gzip"), "x-upsert": "true"}, timeout=60)
    if r.status_code >= 300:
        raise RuntimeError(f"Zaxira yuklanmadi ({r.status_code}): {r.text[:200]}")
    return {"file": name, "rows": rows, "kb": round(len(data) / 1024), "pruned": _prune()}
