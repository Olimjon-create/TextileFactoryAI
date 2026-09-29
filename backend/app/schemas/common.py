"""Bir nechta modul ishlatadigan umumiy validatorlar."""


def clean_str(value: str | None) -> str | None:
    """Chetdagi bo'shliqlarni olib tashlaydi; bo'sh satr -> None."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def media_url(value: str | None) -> str | None:
    """Rasm manzili: faqat o'zimiz yuklagan fayl (/media/...) yoki http(s) havola."""
    value = clean_str(value)
    if value is None:
        return None
    if not (value.startswith("/media/") or value.startswith(("http://", "https://"))):
        raise ValueError("Rasm manzili noto'g'ri")
    return value
