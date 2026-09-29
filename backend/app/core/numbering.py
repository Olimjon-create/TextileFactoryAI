"""Hujjat raqamlari (PO-000001, SH-000001, SUP-00001 ...) — fabrika ichida ketma-ket."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session


def next_number(db: Session, column, factory_column, factory_id: int, prefix: str, width: int = 6) -> str:
    """Fabrikadagi eng katta `prefix`+raqamdan keyingisi. Takrorlanishdan UNIQUE cheklov himoya qiladi."""
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    values = db.scalars(select(column).where(factory_column == factory_id, column.like(f"{prefix}%")))
    numbers = [int(m.group(1)) for v in values if (m := pattern.match(v))]
    return f"{prefix}{max(numbers, default=0) + 1:0{width}d}"
