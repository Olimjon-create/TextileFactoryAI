from dataclasses import dataclass

from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    full_name: str


def verify_google_credential(credential: str) -> GoogleIdentity:
    """Google Identity Services bergan ID tokenni (JWT) tekshiradi.

    Imzo, muddati, `aud` (bizning Client ID) va `iss` Google kutubxonasi tomonidan tekshiriladi.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google orqali kirish sozlanmagan")
    try:
        claims = id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google tokeni yaroqsiz")

    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google email tasdiqlanmagan")

    email = claims["email"].lower()
    return GoogleIdentity(
        sub=claims["sub"],
        email=email,
        full_name=claims.get("name") or email.split("@")[0],
    )
