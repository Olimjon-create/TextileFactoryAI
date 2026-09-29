"""Backend xabarlarining tarjimasi (uz — asosiy, ru, en).

Frontend har so'rovda `Accept-Language: uz|ru|en` yuboradi; middleware tilni kontekstga yozadi.
t("{name} kelgani belgilanmagan", name=...) — o'zbekcha shablon kalit, tarjimasi MESSAGES da.
Tarjima bo'lmasa o'zbekchasi qaytadi. Bazaga yoziladigan matnlar (audit, izohlar) tarjima qilinmaydi.
"""

from contextvars import ContextVar

LANGS = ("uz", "ru", "en")
_lang: ContextVar[str] = ContextVar("lang", default="uz")


def set_lang(header: str | None) -> None:
    code = (header or "").split(",")[0].strip()[:2].lower()
    _lang.set(code if code in LANGS else "uz")


def get_lang() -> str:
    return _lang.get()


def t(template: str, **kwargs) -> str:
    return t_lang(_lang.get(), template, **kwargs)


def t_lang(lang: str, template: str, **kwargs) -> str:
    """Aniq tilda (so'rovdan tashqari — masalan, Telegram xabari zavod tanlagan tilda)"""
    text = template if lang == "uz" else MESSAGES.get(template, {}).get(lang, template)
    return text.format(**kwargs) if kwargs else text


# Ishlab chiqarish bosqichlari (xabarlar ichida)
STAGES = {
    "Kesish": {"ru": "Раскрой", "en": "Cutting"},
    "Tikuv": {"ru": "Пошив", "en": "Sewing"},
    "Pardoz": {"ru": "Отделка", "en": "Finishing"},
    "Sifat nazorati": {"ru": "ОТК", "en": "Quality control"},
    "Qadoqlash": {"ru": "Упаковка", "en": "Packing"},
}


def stage(name: str) -> str:
    return STAGES.get(name, {}).get(_lang.get(), name)


MONTHS = {
    "ru": ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
}
MONTHS_FULL = {
    "ru": ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
}
MONTHS_NOMINATIVE = {
    "ru": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
    "en": MONTHS_FULL["en"],
}


def _m(ru: str, en: str) -> dict[str, str]:
    return {"ru": ru, "en": en}


MESSAGES: dict[str, dict[str, str]] = {
    # --- bildirishnomalar ---
    "Buyurtma {number} kechikmoqda": _m("Заказ {number} просрочен", "Order {number} is overdue"),
    "{customer} · muddat {date}": _m("{customer} · срок {date}", "{customer} · due {date}"),
    "Yangi buyurtma {number}": _m("Новый заказ {number}", "New order {number}"),
    "{number}: foyda past": _m("{number}: низкая прибыль", "{number}: low profit"),
    "Foyda {margin}% (tannarx {cost})": _m("Прибыль {margin}% (себестоимость {cost})", "Profit {margin}% (cost {cost})"),
    "{number} kechikmoqda": _m("{number} просрочен", "{number} is overdue"),
    "{product} × {qty} · reja {date}": _m("{product} × {qty} · план {date}", "{product} × {qty} · planned {date}"),
    "{number}: brak {rate}%": _m("{number}: брак {rate}%", "{number}: defects {rate}%"),
    "Chegara {limit}% · {bad} dona brak": _m("Порог {limit}% · {bad} шт. брака", "Threshold {limit}% · {bad} defective pcs"),
    "Xarid {number} kechikmoqda": _m("Закупка {number} просрочена", "Purchase {number} is overdue"),
    "Kutilgan sana {date}": _m("Ожидаемая дата {date}", "Expected date {date}"),
    "{code}: tugadi": _m("{code}: закончился", "{code}: out of stock"),
    "{code}: kam qoldi": _m("{code}: заканчивается", "{code}: running low"),
    "{name} · qoldiq {stock}, minimum {min}": _m("{name} · остаток {stock}, минимум {min}", "{name} · stock {stock}, minimum {min}"),
    "Jo'natma {number} kechikmoqda": _m("Отгрузка {number} просрочена", "Shipment {number} is overdue"),
    "Reja {date} — hali yo'lga chiqmagan": _m("План {date} — ещё не отправлена", "Planned {date} — not dispatched yet"),
    "{code} buzilgan": _m("{code} неисправна", "{code} is broken"),
    "{code}: texnik xizmat muddati o'tdi": _m("{code}: срок ТО прошёл", "{code}: maintenance overdue"),
    "{count} ta AI hodisasi tasdiqlashni kutmoqda": _m("{count} событий ИИ ожидают подтверждения", "{count} AI events awaiting confirmation"),
    "Kamera/sensor hodisalarini ko'rib chiqing": _m("Проверьте события камер/датчиков", "Review camera/sensor events"),
    "{code}: aloqa yo'q": _m("{code}: нет связи", "{code}: offline"),
    "{name} · oxirgi aloqa {seen} (UTC)": _m("{name} · последняя связь {seen} (UTC)", "{name} · last seen {seen} (UTC)"),
    # --- tushum grafigi ---
    "{year}-yil": _m("{year} г.", "{year}"),
    # --- tannarx ---
    "Buyurtma hali tugallanmagan ({packed}/{ordered} dona qadoqlangan) — foyda yakuniy emas, xarajatlar hali qo'shiladi": _m(
        "Заказ ещё не завершён (упаковано {packed}/{ordered} шт.) — прибыль не окончательная, расходы ещё добавятся",
        "The order is not finished yet ({packed}/{ordered} pcs packed) — profit is not final, costs will still be added"),
    # --- takrorlanadigan kod ---
    "'{code}' kodli mijoz allaqachon mavjud": _m("Клиент с кодом '{code}' уже существует", "A customer with code '{code}' already exists"),
    "'{code}' kodli yetkazib beruvchi allaqachon mavjud": _m("Поставщик с кодом '{code}' уже существует", "A supplier with code '{code}' already exists"),
    "'{code}' kodli material allaqachon mavjud": _m("Материал с кодом '{code}' уже существует", "A material with code '{code}' already exists"),
    "'{code}' kodli joy allaqachon mavjud": _m("Место с кодом '{code}' уже существует", "A location with code '{code}' already exists"),
    "'{code}' kodli liniya allaqachon mavjud": _m("Линия с кодом '{code}' уже существует", "A line with code '{code}' already exists"),
    "'{code}' kodli mahsulot allaqachon mavjud": _m("Изделие с кодом '{code}' уже существует", "A product with code '{code}' already exists"),
    "'{code}' kodli qurilma allaqachon mavjud": _m("Устройство с кодом '{code}' уже существует", "A device with code '{code}' already exists"),
    "'{code}' inventar raqami band": _m("Инвентарный номер '{code}' занят", "Asset number '{code}' is taken"),
    "'{code}' tabel raqami band": _m("Табельный номер '{code}' занят", "Employee ID '{code}' is taken"),
    "{label} topilmadi": _m("{label}: не найдено", "{label} not found"),
    "«{code}» kodi topilmadi": _m("Код «{code}» не найден", "Code «{code}» not found"),
    # --- davomat ---
    "{name} bu kuni {time} da kelgan deb belgilangan": _m("{name} в этот день отмечен пришедшим в {time}", "{name} is already marked as arrived at {time} that day"),
    "{name} kelgani belgilanmagan": _m("Приход {name} не отмечен", "{name}'s arrival is not marked"),
    "{name} {time} da ketgan deb belgilangan": _m("{name} уже отмечен ушедшим в {time}", "{name} is already marked as left at {time}"),
    # --- ishlab chiqarish ---
    "Bu qator uchun faqat {left} dona rejalashtirish mumkin": _m("Для этой позиции можно запланировать только {left} шт.", "Only {left} pcs can be planned for this line"),
    "Allaqachon {cut} dona kesilgan — rejani undan kam qilib bo'lmaydi": _m("Уже раскроено {cut} шт. — план не может быть меньше", "{cut} pcs are already cut — the plan cannot be lower"),
    "Buyurtma qatori uchun ko'pi bilan {left} dona": _m("Для позиции заказа не более {left} шт.", "At most {left} pcs for the order line"),
    "reja": _m("план", "plan"),
    " (+{pct}% ortiqcha kesish)": _m(" (+{pct}% перекрой)", " (+{pct}% over-cut)"),
    "«{stage}» bosqichidan kelgan yaroqli": _m("годные с этапа «{stage}»", "good pieces from «{stage}»"),
    "{stage}: yana ko'pi bilan {remaining} dona kiritish mumkin ({source} — {available} dona, ishlangan — {done})": _m(
        "{stage}: можно ввести ещё не более {remaining} шт. ({source} — {available} шт., обработано — {done})",
        "{stage}: at most {remaining} more pcs can be entered ({source} — {available} pcs, processed — {done})"),
    "{code} mashinasi hozir ishlamaydi ({status}) — holatini yangilang": _m("Машина {code} сейчас не работает ({status}) — обновите её состояние", "Machine {code} is not running ({status}) — update its status"),
    "Omborga {received} dona qabul qilingan — bu qadoqlash yozuvini o'chirib bo'lmaydi": _m("На склад принято {received} шт. — эту запись упаковки удалить нельзя", "{received} pcs were received into stock — this packing record cannot be deleted"),
    "«{stage}» bosqichi bu miqdorni allaqachon ishlagan — avval o'sha yozuvni o'chiring": _m("Этап «{stage}» уже обработал это количество — сначала удалите ту запись", "The «{stage}» stage has already processed this quantity — delete that record first"),
    "{label} {limit} dona, ulardan {used} tasi allaqachon partiyalarga ajratilgan": _m("{label} {limit} шт., из них {used} уже распределено по партиям", "{label} {limit} pcs, of which {used} are already split into batches"),
    "{label} {limit} dona, ulardan {used} tasi allaqachon qutilarga ajratilgan": _m("{label} {limit} шт., из них {used} уже разложено по коробкам", "{label} {limit} pcs, of which {used} are already packed into boxes"),
    # --- xarid, ombor ---
    "{code}: material nofaol": _m("{code}: материал неактивен", "{code}: material is inactive"),
    "{code}: ko'pi bilan {left} qabul qilinadi (buyurtmada qolgani)": _m("{code}: можно принять не более {left} (остаток по заказу)", "{code}: at most {left} can be received (remaining on the order)"),
    "{code}: qaysi joyga qaytarilishini tanlang": _m("{code}: выберите, в какое место вернуть", "{code}: choose where to return it"),
    "{code}: buyurtmaga {issued} chiqarilgan — undan ko'p qaytarib bo'lmaydi": _m("{code}: на заказ выдано {issued} — больше вернуть нельзя", "{code}: {issued} was issued to the order — you can't return more"),
    "{code}: omborda yetarli emas — bor {have}, kerak {need}": _m("{code}: на складе недостаточно — есть {have}, нужно {need}", "{code}: not enough in stock — have {have}, need {need}"),
    "«{location}» joyida yetarli qoldiq yo'q: bor {balance} ({unit})": _m("В месте «{location}» недостаточно остатка: есть {balance} ({unit})", "Not enough stock at «{location}»: {balance} available ({unit})"),
    "«{location}» joyida {product} yetarli emas: bor {balance} dona": _m("В месте «{location}» недостаточно {product}: есть {balance} шт.", "Not enough {product} at «{location}»: {balance} pcs available"),
    "Ko'pi bilan {remaining} dona (qadoqlangan {packed}, omborga topshirilgan {received})": _m("Не более {remaining} шт. (упаковано {packed}, сдано на склад {received})", "At most {remaining} pcs (packed {packed}, handed to warehouse {received})"),
    "«{product}»: ko'pi bilan {left} dona (buyurtmada {ordered}, jo'natmalarda {shipped})": _m("«{product}»: не более {left} шт. (в заказе {ordered}, в отгрузках {shipped})", "«{product}»: at most {left} pcs (ordered {ordered}, in shipments {shipped})"),
    "«{product}» katalogdan o'chirilgan — ombor qoldig'i yo'q": _m("«{product}» удалено из каталога — складского остатка нет", "«{product}» was removed from the catalog — no stock"),
    "«{product}»: omborda {have} dona, kerak {need}": _m("«{product}»: на складе {have} шт., нужно {need}", "«{product}»: {have} pcs in stock, {need} needed"),
    # --- buyurtma va mahsulot ---
    "«{product}» uchun {label}ni tanlang": _m("Выберите {label} для «{product}»", "Choose a {label} for «{product}»"),
    "«{product}» uchun bunday {label} yo'q: {value}": _m("У «{product}» нет такого значения ({label}): {value}", "«{product}» has no such {label}: {value}"),
    "«{product}» uchun {label} tanlanmaydi": _m("Для «{product}» {label} не выбирается", "«{product}» has no {label} option"),
    "o'lcham": _m("размер", "size"),
    "rang": _m("цвет", "color"),
    "«{product}» arxivlangan": _m("«{product}» в архиве", "«{product}» is archived"),
    "«{product}» uchun narx kiriting": _m("Укажите цену для «{product}»", "Enter a price for «{product}»"),
    "Rasm hajmi {mb} MB dan oshmasligi kerak": _m("Размер изображения не должен превышать {mb} МБ", "Image must not exceed {mb} MB"),
    "To'lov provayderi sozlanmagan: {provider}": _m("Платёжный провайдер не настроен: {provider}", "Payment provider is not configured: {provider}"),
    # --- parolni tiklash ---
    "Parolni tiklash sozlanmagan — administratorga murojaat qiling": _m("Восстановление пароля не настроено — обратитесь к администратору", "Password reset is not configured — contact the administrator"),
    "Salom, {name}!": _m("Здравствуйте, {name}!", "Hello, {name}!"),
    "TextileCore hisobingiz parolini tiklash so'raldi. Yangi parol o'rnatish uchun havolani bosing (1 soat amal qiladi):": _m(
        "Запрошено восстановление пароля вашего аккаунта TextileCore. Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):",
        "A password reset was requested for your TextileCore account. Click the link to set a new password (valid for 1 hour):"),
    "Yangi parol o'rnatish": _m("Задать новый пароль", "Set a new password"),
    "Agar buni siz so'ramagan bo'lsangiz, xatga e'tibor bermang — parolingiz o'zgarmaydi.": _m(
        "Если вы этого не запрашивали, просто проигнорируйте письмо — пароль не изменится.",
        "If you didn't request this, ignore this email — your password won't change."),
    "TextileCore: parolni tiklash": _m("TextileCore: восстановление пароля", "TextileCore: password reset"),
    "Xatni yuborib bo'lmadi, keyinroq urinib ko'ring": _m("Не удалось отправить письмо, попробуйте позже", "Could not send the email, try again later"),
    "Havola yaroqsiz yoki muddati o'tgan — qaytadan so'rang": _m("Ссылка недействительна или устарела — запросите новую", "The link is invalid or expired — request a new one"),
    # --- Telegram ---
    "Telegram bot sozlanmagan": _m("Telegram-бот не настроен", "Telegram bot is not configured"),
    "Telegram bilan bog'lanib bo'lmadi, keyinroq urinib ko'ring": _m("Не удалось связаться с Telegram, попробуйте позже", "Could not reach Telegram, try again later"),
    "Botda «Start» bosilmagan — havolani ochib, Start tugmasini bosing va qayta tekshiring": _m(
        "В боте не нажат «Start» — откройте ссылку, нажмите Start и проверьте снова",
        "«Start» wasn't pressed in the bot — open the link, press Start and check again"),
    "Xabar yuborilmadi — Telegram ulanganini tekshiring": _m("Сообщение не отправлено — проверьте подключение Telegram", "Message not sent — check the Telegram connection"),
    "TextileCore bildirishnomalari ulandi: {factory}": _m("Уведомления TextileCore подключены: {factory}", "TextileCore notifications connected: {factory}"),
    "Sinov xabari: TextileCore → {factory} ✅": _m("Тестовое сообщение: TextileCore → {factory} ✅", "Test message: TextileCore → {factory} ✅"),
    "🛒 Yangi buyurtma <b>{number}</b> (katalog, to'langan)\n{customer}, {phone}\n{amount}": _m(
        "🛒 Новый заказ <b>{number}</b> (каталог, оплачен)\n{customer}, {phone}\n{amount}",
        "🛒 New order <b>{number}</b> (catalog, paid)\n{customer}, {phone}\n{amount}"),
    "📝 Yangi buyurtma <b>{number}</b> kiritildi\n{customer} · {amount}\nKiritdi: {user}": _m(
        "📝 Введён новый заказ <b>{number}</b>\n{customer} · {amount}\nВвёл: {user}",
        "📝 New order <b>{number}</b> entered\n{customer} · {amount}\nBy: {user}"),
    "⛔ <b>{code}</b> {name} tugadi — omborda qolmadi": _m("⛔ <b>{code}</b> {name} закончился — на складе нет", "⛔ <b>{code}</b> {name} is out of stock"),
    "⚠️ <b>{code}</b> {name} kam qoldi: {stock} {unit} (minimum {min})": _m(
        "⚠️ <b>{code}</b> {name} заканчивается: {stock} {unit} (минимум {min})",
        "⚠️ <b>{code}</b> {name} is running low: {stock} {unit} (minimum {min})"),
    "🔧 Mashina <b>{code}</b> {name} buzildi\nSabab: {reason}\nBelgiladi: {user}": _m(
        "🔧 Машина <b>{code}</b> {name} сломалась\nПричина: {reason}\nОтметил: {user}",
        "🔧 Machine <b>{code}</b> {name} broke down\nReason: {reason}\nReported by: {user}"),
    "🙋 Javob so'rovi: <b>{name}</b>, {period}\nSabab: {reason}\nTasdiqlash: Davomat → Javob so'rovlari": _m(
        "🙋 Запрос на отгул: <b>{name}</b>, {period}\nПричина: {reason}\nПодтвердить: Посещаемость → Запросы на отгул",
        "🙋 Leave request: <b>{name}</b>, {period}\nReason: {reason}\nApprove: Attendance → Leave requests"),
    # --- Telegram bot (mijozlar) ---
    "👋 Assalomu alaykum, {name}!\n\n<b>TextileCore</b> — tikuv fabrikalari katalogi. Kiyimlarni to'g'ridan-to'g'ri ishlab chiqaruvchidan buyurtma qiling.\n\n🛍 «Do'konni ochish» tugmasini bosing: mahsulotni tanlang, savatga qo'shing va to'lang.\n📦 Buyurtmangiz holati haqida shu yerga xabar beramiz.": _m(
        "👋 Здравствуйте, {name}!\n\n<b>TextileCore</b> — каталог швейных фабрик. Заказывайте одежду напрямую у производителя.\n\n🛍 Нажмите «Открыть магазин»: выберите товар, добавьте в корзину и оплатите.\n📦 О статусе заказа мы сообщим сюда.",
        "👋 Hello, {name}!\n\n<b>TextileCore</b> is a catalog of garment factories. Order clothing directly from the manufacturer.\n\n🛍 Tap “Open shop”: pick a product, add it to the cart and pay.\n📦 We will send your order status updates here."),
    "👋 Assalomu alaykum, {name}!\n\n<b>{factory}</b> do'koniga xush kelibsiz.\n\n🛍 «Do'konni ochish» tugmasini bosing: mahsulotni tanlang, savatga qo'shing va to'lang.\n📦 Buyurtmangiz holati haqida shu yerga xabar beramiz.": _m(
        "👋 Здравствуйте, {name}!\n\nДобро пожаловать в магазин <b>{factory}</b>.\n\n🛍 Нажмите «Открыть магазин»: выберите товар, добавьте в корзину и оплатите.\n📦 О статусе заказа мы сообщим сюда.",
        "👋 Hello, {name}!\n\nWelcome to the <b>{factory}</b> shop.\n\n🛍 Tap “Open shop”: pick a product, add it to the cart and pay.\n📦 We will send your order status updates here."),
    "🛍 Do'konni ochish": _m("🛍 Открыть магазин", "🛍 Open shop"),
    "🏭 Barcha fabrikalar": _m("🏭 Все фабрики", "🏭 All factories"),
    "📦 Buyurtmalarim": _m("📦 Мои заказы", "📦 My orders"),
    "Buyurtma berish uchun «Do'konni ochish» tugmasini bosing 👇": _m("Чтобы сделать заказ, нажмите «Открыть магазин» 👇", "To place an order, tap “Open shop” 👇"),
    "Hozircha buyurtmalaringiz yo'q. «Do'konni ochish» tugmasi orqali buyurtma bering.": _m(
        "У вас пока нет заказов. Сделайте заказ через кнопку «Открыть магазин».",
        "You have no orders yet. Place one with the “Open shop” button."),
    "📦 <b>Buyurtmalaringiz</b>": _m("📦 <b>Ваши заказы</b>", "📦 <b>Your orders</b>"),
    "Havola noto'g'ri yoki eskirgan. Saytda Sozlamalar → Telegram bo'limidan qayta oching.": _m(
        "Ссылка неверна или устарела. Откройте её заново на сайте: Настройки → Telegram.",
        "The link is invalid or outdated. Open it again on the website: Settings → Telegram."),
    "✅ To'lov qabul qilindi!\nBuyurtma <b>{number}</b> · {factory}\n{amount}\n\nHolati o'zgarganda shu yerga xabar beramiz.": _m(
        "✅ Оплата получена!\nЗаказ <b>{number}</b> · {factory}\n{amount}\n\nКогда статус изменится, мы сообщим сюда.",
        "✅ Payment received!\nOrder <b>{number}</b> · {factory}\n{amount}\n\nWe will notify you here when the status changes."),
    "📦 Buyurtma <b>{number}</b> ({factory}): {status}": _m("📦 Заказ <b>{number}</b> ({factory}): {status}", "📦 Order <b>{number}</b> ({factory}): {status}"),
    "To'lov kutilmoqda": _m("Ожидает оплаты", "Awaiting payment"),
    "Qabul qilindi": _m("Принят", "Received"),
    "Tasdiqlandi": _m("Подтверждён", "Confirmed"),
    "Tikilmoqda": _m("В производстве", "In production"),
    "Tayyor": _m("Готов", "Ready"),
    "Yo'lga chiqdi": _m("Отправлен", "Shipped"),
    "Yetkazildi": _m("Доставлен", "Delivered"),
    "Bekor qilindi": _m("Отменён", "Cancelled"),
    "🛍 Do'kon": _m("🛍 Магазин", "🛍 Shop"),
    "Botni ulash": _m("Подключить бота", "Start the bot"),
    "Buyurtmalarim": _m("Мои заказы", "My orders"),
}
