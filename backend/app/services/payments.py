"""To'lov provayderlari.

Hozir faqat `demo` (test rejimi) mavjud: haqiqiy pul yechilmaydi, karta raqami serverga
yuborilmaydi. Haqiqiy provayder (Payme / Click / Uzum) ulash uchun:
  1. Shu yerga provayder klassini qo'shing (start() da provayderning to'lov sahifasi URL'ini qaytaring).
  2. Provayder webhook'i uchun endpoint yozing: imzoni tekshirib, order_service.mark_paid() ni chaqiring.
  3. .env da PAYMENT_PROVIDER=<nomi> va provayder kalitlarini sozlang.
"""

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.core.config import settings
from app.models import Order
from app.core.i18n import t


@dataclass(frozen=True)
class PaymentStart:
    provider: str
    test_mode: bool
    checkout_url: str | None = None


class DemoProvider:
    name = "demo"

    def start(self, order: Order) -> PaymentStart:
        return PaymentStart(provider=self.name, test_mode=True)


_PROVIDERS = {DemoProvider.name: DemoProvider()}


def demo_allowed() -> bool:
    """Demo to'lovda xaridor buyurtmani o'zi "to'langan" qiladi — productionda faqat ochiq ruxsat bilan."""
    return settings.PAYMENT_PROVIDER == DemoProvider.name and (not settings.is_production or settings.ALLOW_DEMO_PAYMENTS)


def get_provider():
    if settings.PAYMENT_PROVIDER == DemoProvider.name and not demo_allowed():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Onlayn to'lov hozircha sozlanmagan")
    provider = _PROVIDERS.get(settings.PAYMENT_PROVIDER)
    if provider is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            t("To'lov provayderi sozlanmagan: {provider}", provider=settings.PAYMENT_PROVIDER),
        )
    return provider
