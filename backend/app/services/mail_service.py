"""Email yuborish — Resend HTTP API (https://resend.com, bepul tarif: kuniga 100 ta xat).

RESEND_API_KEY bo'sh bo'lsa pochta o'chiq: parolni tiklash tugmasi ko'rinmaydi.
"""

import requests

from app.core.config import settings


def enabled() -> bool:
    return settings.mail_enabled


def send(to: str, subject: str, html: str) -> None:
    """Xat yuborish; xato bo'lsa RuntimeError (chaqiruvchi foydalanuvchiga umumiy javob beradi)."""
    response = requests.post(
        "https://api.resend.com/emails",
        json={"from": settings.MAIL_FROM, "to": [to], "subject": subject, "html": html},
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY.strip()}"},
        timeout=15,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"Resend xatosi ({response.status_code}): {response.text[:300]}")
