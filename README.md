# TextileCore — Foundation

Kiyim ishlab chiqaruvchi fabrikalar uchun boshqaruv platformasining asosiy (foundation) qismi.

| Qism | Texnologiya |
|------|-------------|
| Frontend | React 18, TypeScript, Vite, MUI 6, React Router, Axios |
| Backend | Python FastAPI, SQLAlchemy 2, Pydantic 2 |
| Ma'lumotlar bazasi | PostgreSQL |
| Autentifikatsiya | JWT (Bearer token), bcrypt |

## Tuzilma

```
TextileFactoryAI/
├── backend/
│   ├── app/
│   │   ├── core/          # config, database, security (JWT), roles, deps, migrations
│   │   ├── models/        # SQLAlchemy modellari (User, Factory)
│   │   ├── schemas/       # Pydantic sxemalari
│   │   ├── services/      # biznes-logika (ruxsatlar shu yerda)
│   │   ├── api/v1/        # endpointlar va router
│   │   └── main.py
│   ├── migrations/        # Alembic migratsiyalari (versions/)
│   ├── scripts/create_superadmin.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/           # theme, router, navigation (sidebar menyusi)
│       ├── layouts/       # MainLayout, Sidebar, Topbar, AuthLayout
│       ├── features/      # auth, dashboard, factories, users, products, customers
│       └── shared/        # api client, types, constants, umumiy komponentlar
└── docker-compose.yml     # ixtiyoriy: PostgreSQL uchun
```

## Interfeys: Light/Dark rejim, loading va skeletonlar

- **Light/Dark rejim** — 🌙/☀️ tugmasi xodimlar panelining header'ida, mijozlar katalogida va login sahifasida.
  Mavzular `src/app/theme.ts` da (`createAppTheme(mode)`), holat `src/app/ColorModeContext.tsx` da;
  tanlov `localStorage` (`tfai_color_mode`) da saqlanadi, birinchi kirishda tizim sozlamasi olinadi.
  Yangi komponentlarda rangni qattiq yozmang — `background.paper`, `text.secondary`, `divider` kabi
  mavzu qiymatlaridan foydalaning.
- **Sayt ochilgandagi loading** — `index.html` dagi splash (React yuklanishidan oldin, tanlangan rejim rangida),
  sessiya tekshirilgach `src/app/splash.ts` uni yashiradi. Sahifalar `React.lazy` bilan alohida bo'laklarda
  yuklanadi; kutubxonalar `react`, `mui`, `mui-icons` vendor bo'laklarida.
- **Skeletonlar** — `src/shared/components/skeletons.tsx`: statistika kartalari, kartalar, jadval qatorlari,
  katalog kartalari, mahsulot qatorlari va butun sahifa (lazy yuklanishda). Katalog rasmlari yuklanguncha
  ham skeleton ko'rinadi.

### Katalog dizayni (mijozlar uchun)

- Alohida mavzu: `src/features/store/storeTheme.ts` — 2025–2026 moda ranglari: Pantone 2025 **Mocha Mousse**
  (`#a47864`, asosiy), Pantone 2026 **Cloud Dancer** (`#f0eee9`, fon), espresso matn, sage qo'shimcha rang;
  sarlavhalar **Playfair Display** shriftida, "pill" tugmalar, shisha (glass) kartalar. Light/Dark ikkalasida ishlaydi.
  Xodimlar paneli o'zining ERP mavzusida qoladi.
- Fon: `StoreBackdrop.tsx` — kiyimlar fotosurati blur + rang qatlami. Bosh sahifada hero (kollaj, qidiruv,
  ishonch belgilari), kategoriya chiplari va "Qanday ishlaydi" bo'limi.
- Suratlar `frontend/public/brand/` da (Pexels, bepul litsenziya — `CREDITS.txt`).

### Mobil versiya

- Telefonda (< 900px) jadvallar o'rniga ixcham kartalar (`shared/components/MobileList.tsx`, `useIsMobile()`);
  filtrlar `FilterBar` bilan: qidiruv to'liq kenglikda, qolganlari 2 ustunda.
- Dialoglar (formalar) ekranga to'liq sig'adi, sahifalash ixchamlashadi (`theme.ts` dagi global sozlamalar).
- Katalogda savat telefonda pastki panel ko'rinishida (son + jami summa), header tugmalari ikonkaga aylanadi.
- Yangi jadvalli sahifa qo'shganda: `isMobile ? <MobileListItem .../> : <Table>` naqshidan foydalaning.

## Rollar

| Rol | Huquqlar |
|-----|----------|
| SUPER_ADMIN | Barcha fabrikalar va foydalanuvchilar; fabrika yaratish/o'chirish |
| FACTORY_OWNER | O'z fabrikasini tahrirlash, o'zidan past rollardagi xodimlarni boshqarish |
| MANAGER | O'z fabrikasidagi PRODUCTION/WAREHOUSE/QUALITY menejerlari va ishchilarni boshqarish |
| PRODUCTION_MANAGER, WAREHOUSE_MANAGER, QUALITY_MANAGER, WORKER | Dashboard (keyingi modullarda o'z bo'limlari) |

Qoida: foydalanuvchi faqat **o'z fabrikasidagi** va **o'zidan past darajadagi** rollarni boshqaradi
(`backend/app/core/roles.py`).

Ro'yxatdan o'tish (`/register`) yangi fabrika va uning egasini (FACTORY_OWNER) yaratadi.

## API

Backend ishga tushgach Swagger hujjatlari: http://localhost:8001/docs

| Metod | Yo'l | Tavsif |
|-------|------|--------|
| POST | /api/v1/auth/register | Fabrika + egasi ro'yxatdan o'tishi |
| POST | /api/v1/auth/login | Kirish, JWT qaytaradi |
| GET | /api/v1/auth/me | Joriy foydalanuvchi |
| GET | /api/v1/dashboard/stats | Statistikalar (rolga qarab) |
| GET/POST | /api/v1/factories | Fabrikalar ro'yxati / yaratish |
| GET/PATCH/DELETE | /api/v1/factories/{id} | Fabrika |
| GET/POST | /api/v1/users | Foydalanuvchilar ro'yxati / yaratish |
| GET/PATCH/DELETE | /api/v1/users/{id} | Foydalanuvchi |

## Modul: Product Management va BOM

Fabrikada ishlab chiqariladigan kiyim mahsulotlari va ularning material tarkibi (Bill of Materials).

- **Mahsulot:** nomi, kodi (artikul, fabrika ichida unikal), kategoriya, tavsif, o'lchamlar, ranglar,
  ishlab chiqarish birligi (dona / juft / to'plam / dyujina), status (qoralama / faol / arxiv).
- **BOM qatori:** material turi (mato, ip, tugma, fermuar, yorliq, rezina, dublerin, qadoq, aksessuar, boshqa),
  material nomi, 1 birlik mahsulot uchun miqdor, o'lchov birligi (metr, sm, m², kg, gramm, dona, juft, g'altak),
  isrof foizi va izoh. Jami sarf = miqdor × (1 + isrof%).

| Amal | Ruxsat berilgan rollar |
|------|------------------------|
| Ko'rish (ro'yxat, batafsil, BOM) | Fabrikaning barcha xodimlari (faqat o'z fabrikasi), SUPER_ADMIN — hammasi |
| Yaratish / tahrirlash / o'chirish (mahsulot va BOM) | SUPER_ADMIN, FACTORY_OWNER, MANAGER, PRODUCTION_MANAGER |

Rollar ro'yxati: `backend/app/services/product_service.py` (`PRODUCT_EDITOR_ROLES`) va
`frontend/src/features/products/permissions.ts` — ikkalasi bir xil bo'lishi kerak.

| Metod | Yo'l | Tavsif |
|-------|------|--------|
| GET | /api/v1/products?search=&category=&status=&factory_id= | Ro'yxat, qidiruv va filtrlar |
| GET | /api/v1/products/categories | Mavjud kategoriyalar |
| POST | /api/v1/products | Yaratish (ixtiyoriy `bom_items` bilan birga) |
| GET/PATCH/DELETE | /api/v1/products/{id} | Mahsulot (BOM bilan birga qaytadi) |
| GET/POST | /api/v1/products/{id}/bom | BOM qatorlari / qo'shish |
| PATCH/DELETE | /api/v1/products/{id}/bom/{item_id} | BOM qatorini tahrirlash / o'chirish |

## Modul: Customer / CRM

Fabrika mijozlari bazasi. Har bir mijoz bitta fabrikaga bog'langan — fabrika faqat o'z mijozlarini ko'radi.

- **Maydonlar:** nomi (kompaniya yoki F.I.Sh.), mijoz turi (kompaniya / jismoniy shaxs), mijoz kodi
  (fabrika ichida unikal; bo'sh qoldirilsa avtomatik `CUS-00001`, `CUS-00002`, ...), status
  (faol / potensial / nofaol), kontakt shaxs, telefon, email, davlat (ISO kod, masalan `UZ`), manzil, izoh.
- **Sahifalar:** ro'yxat (qidiruv: nomi, kodi, kontakt, telefon, email; filtrlar: status, turi, davlat,
  fabrika — SUPER_ADMIN uchun; server tomonida sahifalash; status bo'yicha statistika kartalari) va
  batafsil sahifa (telefon/email bosilganda qo'ng'iroq/xat ochiladi).

| Amal | Ruxsat berilgan rollar |
|------|------------------------|
| Ko'rish | SUPER_ADMIN, FACTORY_OWNER, MANAGER, PRODUCTION_MANAGER, WAREHOUSE_MANAGER, QUALITY_MANAGER |
| Yaratish / tahrirlash / o'chirish | SUPER_ADMIN, FACTORY_OWNER, MANAGER |
| Kirish yo'q | WORKER |

Rollar: `backend/app/services/customer_service.py` va `frontend/src/features/customers/permissions.ts`.

| Metod | Yo'l | Tavsif |
|-------|------|--------|
| GET | /api/v1/customers?search=&status=&customer_type=&country=&factory_id=&offset=&limit= | Ro'yxat → `{items, total}` |
| GET | /api/v1/customers/stats | Status bo'yicha sonlar |
| GET | /api/v1/customers/countries | Mijozlarda uchraydigan davlatlar |
| POST | /api/v1/customers | Yaratish |
| GET/PATCH/DELETE | /api/v1/customers/{id} | Mijoz |

## Mijozlar katalogi (ochiq do'kon) va buyurtmalar

Mijoz saytni ochganda **login talab qilinmaydi** — `/` manzili mehmonni to'g'ridan-to'g'ri
zavodlar katalogiga (`/store`) olib boradi. Xodimlar "Xodimlar uchun" tugmasi orqali kiradi.

1. **Katalog** (`/store`): zavodlar kartalari — muqova/logo rasmi ustida nomi, qisqa tavsifi va shahri,
   pastida mahsulot turlari va eng arzon narx. Qidiruv mavjud.
2. **Zavod sahifasi** (`/store/factories/:id`): yuqorida zavod haqida batafsilroq ma'lumot va kontaktlar,
   pastda mahsulotlar — narxi va yonida miqdor tugmasi ([−] son [+], sonni qo'lda ham yozish mumkin).
3. **Savat** — o'ng pastdagi tugma. Bitta buyurtma — bitta zavod (boshqa zavod mahsuloti qo'shilsa,
   savatni almashtirish so'raladi). Savat brauzerda saqlanadi.
4. **Rasmiylashtirish**: ism va telefon (ro'yxatdan o'tish shart emas), manzil va izoh ixtiyoriy.
5. **Karta orqali to'lov** → to'lovdan so'ng buyurtma zavodning **Buyurtmalar** bo'limida darhol paydo
   bo'ladi (sidebar'da qizil belgi, har 30 soniyada yangilanadi) va mijoz CRM'ga telefon bo'yicha
   avtomatik qo'shiladi/bog'lanadi. To'lanmagan buyurtmalar zavodga ko'rinmaydi.

6. **Buyurtmalarim** (`/store/orders`, sarlavhadagi tugma): to'langan buyurtmalar mijozning brauzerida
   saqlanadi va bosqichlari bilan ko'rinadi (Qabul qilindi → Tasdiqlandi → Tikilmoqda → Tayyor → Yo'lda →
   Yetkazildi); zavod statusni o'zgartirsa, sahifa o'zi yangilanadi. Boshqa qurilmadan — "Buyurtmani topish":
   buyurtma raqami **va** telefon (ikkalasi mos kelishi shart; faqat telefon bo'yicha qidirib bo'lmaydi).

**Katalogda nima ko'rinadi:** faol va "Katalogda ko'rsatish" yoqilgan zavodlar (Fabrikalar → Tahrirlash →
"Mijozlar katalogidagi profil": logo, muqova, shahar, qisqa va batafsil tavsif) va ularning statusi
**Faol** hamda **narxi kiritilgan** mahsulotlari (Mahsulotlar → narx va rasm). Mahsuloti yo'q zavod ko'rinmaydi.

**Xavfsizlik:** narx va jami summa har doim serverda hisoblanadi; buyurtmaga faqat taxmin qilib
bo'lmaydigan token orqali murojaat qilinadi; katalog API'si ichki ma'lumotlarni (BOM, xodimlar, CRM)
qaytarmaydi; rasm fayllari turi ichidagi baytlar bo'yicha tekshiriladi (JPG/PNG/WEBP, ≤ 5 MB).

**Buyurtma statuslari:** Yangi → Tasdiqlangan → Ishlab chiqarilmoqda → Tayyor → Jo'natilgan → Yakunlangan
(yoki Bekor qilingan). Ko'rish: SUPER_ADMIN, FACTORY_OWNER, MANAGER, PRODUCTION_MANAGER, WAREHOUSE_MANAGER;
status o'zgartirish: WAREHOUSE_MANAGER'dan tashqari o'shalar.

### Demo ma'lumotlar (katalog ko'rinishini sinash uchun)

```powershell
cd backend
.\venv\Scripts\python -m scripts.seed_demo            # 8 ta demo zavod (Zara, H&M, Polo Ralph Lauren, ...) va 29 ta mahsulot
.\venv\Scripts\python -m scripts.seed_demo --download-photos   # + suratlarni loyiha ichiga yuklab olish
.\venv\Scripts\python -m scripts.seed_demo --remove   # hammasini o'chirish
```
Tavsiflar umumma'lum faktlar asosida qisqa yozilgan, narxlar taxminiy. Logo va muqovalar skript tomonidan
chizilgan; mahsulot suratlari (kiyimning o'zi + odam ustida) — [Pexels](https://www.pexels.com/license/)'dagi
bepul litsenziyali namunaviy suratlar (`scripts/demo_photos.py`), brendning o'z mahsuloti emas.
`--download-photos` bilan ular loyiha ichiga (`backend/media/demo/photos`, ~8 MB) yuklab olinadi va
internetsiz ishlaydi; yuklanmagan bo'lsa, Pexels serveridan ko'rsatiladi. Brendlarning logo/rasm/matnlari ishlatilmagan. Bu brendlar platformada
haqiqatan sotmaydi — **sayt ommaga ochilishidan oldin `--remove` bilan o'chiring.**

### To'lov provayderi

Hozir `PAYMENT_PROVIDER=demo` — **test rejimi, haqiqiy pul yechilmaydi**. Karta raqami faqat brauzerda
tekshiriladi (Luhn, muddat) va serverga **yuborilmaydi** — faqat oxirgi 4 raqami chek uchun saqlanadi.
Test kartasi: `4242 4242 4242 4242`, istalgan kelgusi sana.

Haqiqiy to'lov (Payme, Click, Uzum) uchun provayder bilan merchant shartnomasi va kalitlar kerak. Ular
olingach `backend/app/services/payments.py` ga provayder klassi qo'shiladi (to'lov sahifasi URL'i +
webhook → `order_service.mark_paid()`), frontend esa `checkout_url` ga avtomatik yo'naltiradi.

| Metod | Yo'l | Tavsif |
|-------|------|--------|
| GET | /api/v1/store/factories | Katalog (ochiq) |
| GET | /api/v1/store/factories/{id} | Zavod va sotuvdagi mahsulotlar (ochiq) |
| POST | /api/v1/store/orders | Buyurtma yaratish (ochiq) |
| GET | /api/v1/store/orders/{token} | Buyurtma holati (ochiq, token orqali) |
| POST | /api/v1/store/orders/my | "Buyurtmalarim": saqlangan tokenlar bo'yicha to'langan buyurtmalar |
| POST | /api/v1/store/orders/find | Buyurtma raqami + telefon bo'yicha topish |
| POST | /api/v1/store/orders/{token}/pay/demo | Test to'lov |
| GET | /api/v1/orders?search=&status=&factory_id=&offset=&limit= | Zavod buyurtmalari |
| GET | /api/v1/orders/summary | Status bo'yicha sonlar, yangilar soni |
| GET | /api/v1/orders/{id} | Buyurtma |
| PATCH | /api/v1/orders/{id}/status | Statusni o'zgartirish |
| POST | /api/v1/uploads/images | Rasm yuklash (logo, muqova, mahsulot) |

## Ma'lumotlar bazasi migratsiyalari (Alembic)

Sxema `backend/migrations/versions` dagi Alembic migratsiyalari bilan boshqariladi:

| Versiya | Tarkibi |
|---------|---------|
| `0001_baseline` | factories, users, products, bom_items |
| `0002_customers` | customers |
| `0003_storefront_orders` | zavod katalog profili, mahsulot narxi/rasmi, orders, order_items |

Backend ishga tushganda `alembic upgrade head` **avtomatik** bajariladi (`AUTO_MIGRATE=true`).
Alembic'dan oldin yaratilgan bazalar (ichida `alembic_version` jadvali yo'q) avtomatik `0001_baseline`
deb belgilanadi va keyingi migratsiyalar qo'llanadi — mavjud ma'lumotlar saqlanadi.

Qo'lda boshqarish (backend papkasida, venv faol):
```powershell
alembic current                                  # joriy versiya
alembic upgrade head                             # oxirgi versiyagacha yangilash
alembic downgrade -1                             # oxirgi migratsiyani bekor qilish
alembic revision --autogenerate -m "orders"      # modeldagi o'zgarishdan yangi migratsiya
```

## Google orqali kirish

Login va Register sahifalarida "Google bilan davom etish" tugmasi bor. Avval shu brauzerda Google
orqali kirgan foydalanuvchi keyingi safar **One Tap** orqali avtomatik kiradi (chiqish tugmasi
bosilgandan keyin avtomatik kirish to'xtatiladi).

- Email tizimda bor bo'lsa (masalan, admin qo'shgan xodim), o'sha foydalanuvchi va uning roli bilan kiradi.
- Email yangi bo'lsa, "<Ism> fabrikasi" nomli fabrika va uning egasi (FACTORY_OWNER) avtomatik yaratiladi.
- Faqat Google tasdiqlagan emaillar qabul qilinadi; token backendda Google kalitlari bilan tekshiriladi.

**Sozlash (bir marta):**
1. https://console.cloud.google.com → yangi loyiha yarating (yoki mavjudini tanlang).
2. *APIs & Services → OAuth consent screen*: User type **External**, ilova nomi va emailingizni kiriting.
   Test rejimida bo'lsa, *Test users* ga kiradigan Google hisoblarni qo'shing.
3. *APIs & Services → Credentials → Create credentials → OAuth client ID*, turi **Web application**.
   *Authorized JavaScript origins* ga ikkalasini qo'shing:
   `http://localhost` va `http://localhost:5180`. (Redirect URI kerak emas.)
4. Olingan Client ID'ni (`....apps.googleusercontent.com`) `backend\.env` dagi `GOOGLE_CLIENT_ID=` ga yozing
   va backendni qayta ishga tushiring. Frontend uni backenddan o'zi oladi.

## Testlar

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest -q
```
Testlar vaqtinchalik SQLite bazasida ishlaydi va PostgreSQL'dagi ma'lumotlarga tegmaydi.
`tests/test_migrations.py` migratsiyalar modellar bilan bir xil sxema yaratishini ham tekshiradi.

## Yangi modul qo'shish (ERP, MES, warehouse, production, quality, AI/CV)

1. Backend: `app/models/<modul>.py`, `app/schemas/<modul>.py`, `app/services/<modul>_service.py`,
   `app/api/v1/endpoints/<modul>.py` yarating; modelni `app/models/__init__.py` ga,
   routerni `app/api/v1/router.py` ga qo'shing. Ruxsat uchun `Depends(require_roles(...))`.
2. Migratsiya: `alembic revision --autogenerate -m "<modul>"`, hosil bo'lgan faylni ko'zdan kechiring;
   `pytest tests/test_migrations.py` model va migratsiya mosligini tekshiradi.
3. Frontend: `src/features/<modul>/` (api.ts, pages/, components/) yarating; sahifani
   `src/app/router.tsx` ga, menyu elementini `src/app/navigation.tsx` ga qo'shing.

Windows'da o'rnatish bo'yicha to'liq yo'riqnoma pastda.

## Windows'da o'rnatish va ishga tushirish

### 1. Kerakli dasturlar
- **Python 3.10+** — https://www.python.org/downloads/ (o'rnatishda *"Add python.exe to PATH"* belgilansin)
- **Node.js 20+ (LTS)** — https://nodejs.org
- **PostgreSQL 16** — https://www.postgresql.org/download/windows/ (o'rnatishda `postgres` foydalanuvchisi uchun parol kiriting va eslab qoling)
  - yoki Docker Desktop bo'lsa: loyiha papkasida `docker compose up -d`

### 2. Ma'lumotlar bazasini yaratish
*SQL Shell (psql)* yoki pgAdmin'ni oching:
```sql
CREATE DATABASE textile_factory_ai;
```
(Docker ishlatsangiz bu qadam shart emas.)

### 3. Backend
PowerShell'da:
```powershell
cd $HOME\Desktop\TextileFactoryAI\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```
`.env` faylini oching va `DATABASE_URL` dagi parolni (`postgres:postgres` → `postgres:<SIZNING_PAROLINGIZ>`)
hamda `JWT_SECRET_KEY` ni o'zgartiring.

Birinchi SUPER_ADMIN ni yarating va serverni ishga tushiring:
```powershell
python -m scripts.create_superadmin
uvicorn app.main:app --reload --port 8001
```
Tekshirish: http://localhost:8001/docs

> `Activate.ps1` xato bersa: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` buyrug'ini bir marta bajaring.
> 8000 port ishlatilmadi, chunki u ba'zi kompyuterlarda (masalan, iVMS-4200) band bo'ladi.

### 4. Frontend
Yangi PowerShell oynasida:
```powershell
cd $HOME\Desktop\TextileFactoryAI\frontend
npm install
npm run dev
```
Brauzerda: http://localhost:5180

### 5. Kirish
- SUPER_ADMIN: `admin@textile.ai` / `Admin12345` (`.env` dagi `SUPERADMIN_*` qiymatlari)
- Yoki `/register` sahifasida yangi fabrika ro'yxatdan o'tkazing.

### Keyingi safar ishga tushirish
Bitta buyruq backend va frontendni ikki oynada ochadi:
```powershell
cd $HOME\Desktop\TextileFactoryAI
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```
Frontend doim **5180** portda ishlaydi (`strictPort`). Port band bo'lsa, jimgina boshqa portga o'tmaydi, xato beradi.
SUPER_ADMIN backend birinchi marta ishga tushganda avtomatik yaratiladi.

### Lokal ishlab chiqish uchun SQLite
PostgreSQL hali o'rnatilmagan bo'lsa, `backend\.env` da vaqtincha SQLite ishlatish mumkin:
`DATABASE_URL=sqlite:///./textile_dev.db`. PostgreSQL tayyor bo'lgach, `postgresql+psycopg://...`
qatoriga qaytaring (SQLite'dagi ma'lumotlar avtomatik ko'chmaydi).

## Supabase (Free Plan) — baza va rasmlar

Supabase bu yerda **PostgreSQL baza** va **Storage (rasmlar)** sifatida ishlatiladi. Backend (FastAPI), login/JWT,
rollar va Google orqali kirish o'zgarmaydi — frontend Supabase'ga to'g'ridan-to'g'ri ulanmaydi, kalit kerak emas.

1. **Loyiha**: supabase.com → New project (region: Frankfurt `eu-central-1` yaqinroq). DB parolini saqlab qo'ying.
2. **Baza manzili**: Connect → *Session pooler* URI → `backend\.env` dagi `DATABASE_URL` (`[YOUR-PASSWORD]` o'rniga parol).
   Direct connection (`db.<ref>.supabase.co`) faqat IPv6 — ko'p uy/ofis tarmoqlarida ishlamaydi.
3. **Storage**: Storage → New bucket → nomi `media`, **Public bucket** yoqilgan.
   Project Settings → API Keys → *Secret key* (yoki legacy `service_role`) → `SUPABASE_SECRET_KEY`,
   Project URL (`https://<ref>.supabase.co`) → `SUPABASE_URL`.
4. **Ma'lumotlarni ko'chirish** (bir marta): `cd backend` → `venv\Scripts\python -m scripts.migrate_to_supabase`.
   Jadvallar yaratiladi, `textile_dev.db` dagi hamma ma'lumot va yuklangan rasmlar ko'chadi (SQLite fayl o'zgarmaydi).
5. Dasturni odatdagidek ishga tushiring — endi hammasi Supabase'da.

**Xavfsizlik (RLS)**: backend har migratsiyadan keyin `public` jadvallarida RLS'ni yoqadi (siyosatsiz) — Supabase
Data API (anon kalit) orqali hech narsa o'qib/yozib bo'lmaydi; backend jadval egasi sifatida ishlaydi.

**Free Plan cheklovlari**: baza 500 MB, Storage 1 GB; 7 kun faollik bo'lmasa loyiha pauza qilinadi
(Dashboard → *Restore* bilan qayta yoqiladi, ma'lumotlar saqlanadi). Avtomatik zaxira yo'q — muhim bosqichlarda
`zaxira-olish.bat` (`python -m scripts.backup_db`) bilan butun bazani `backend\backups\*.db` ga saqlang. Qaytarish:
`python -m scripts.migrate_to_supabase --source sqlite:///./backups/<fayl>.db --replace`.

**Vercel'da**: `DATABASE_URL` = *Transaction pooler* URI (port 6543), `DB_NULL_POOL=true`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

**SQLite'ga qaytish**: `DATABASE_URL=sqlite:///./textile_dev.db`, `SUPABASE_*` bo'sh (Supabase'dagi yangi ma'lumotlar qaytmaydi).

## AI / Computer Vision integratsiyasi

Kamera, AI hisoblash qutisi, skaner yoki mashina sensori tizimga **qurilma** sifatida ulanadi ("Kameralar va AI" sahifasi). Qurilma qo'shilganda **kalit** (`tfd_...`) bir marta ko'rsatiladi — bazada faqat SHA-256 xeshi saqlanadi; yo'qolsa almashtiriladi.

**Hodisa yuborish:** `POST /api/v1/vision/ingest`, sarlavha `X-Device-Key: tfd_...`, bir so'rovda 100 tagacha hodisa (qurilma bo'yicha 600 so'rov/daq):

```json
{"events": [
  {"event_type": "COUNT", "external_id": "cam01-000123", "quantity": 12, "confidence": 0.94,
   "occurred_at": "2026-09-24T10:15:00+05:00", "work_order": "WO-000012", "unit_code": "WO-000012-P01",
   "employee_code": "EMP-00004", "data": {"model": "yolo-v8", "bbox": [10, 20, 200, 180]}},
  {"event_type": "DEFECT", "external_id": "cam01-000124", "quantity": 1, "defect_reason": "Mato teshik", "confidence": 0.88},
  {"event_type": "MACHINE_STATE", "external_id": "sens-77", "machine_state": "BROKEN", "confidence": 0.97},
  {"event_type": "CUSTOM", "data": {"ppe": "no_gloves"}}
]}
```

| Maydon | Ma'nosi |
|---|---|
| `event_type` | `COUNT` sanoq · `DEFECT` brak · `MACHINE_STATE` mashina holati (`WORKING/IDLE/BROKEN/MAINTENANCE`) · `CUSTOM` boshqa kuzatuv (faqat saqlanadi) |
| `external_id` | qurilmadagi noyob ID — qayta yuborilsa ikki marta yozilmaydi (javobda `duplicate: true`) |
| `work_order` / `unit_code` | qaysi ish buyurtmasi; bo'sh bo'lsa — qurilmaga biriktirilgan ish buyurtmasi |
| `stage` | bosqich; bo'sh bo'lsa — qurilmaning bosqichi |
| `confidence` | model ishonchi 0–1 |
| `events: []` | faqat "tirikman" signali (qurilma onlayn ko'rinadi) |

**Qayta ishlash:** hodisa doim saqlanadi. **Qoida** (bazada, "Qoidalar" yorlig'i) hal qiladi: *avtomatik qo'llash* (ishonch chegarasidan yuqori bo'lsa), *odam tasdiqlaydi* yoki *faqat saqlash*; qoida bo'lmasa — odam tasdiqlaydi. Qo'llash faqat mavjud yo'llar orqali: sanoq/brak → ishlab chiqarish yozuvi (`source=CAMERA`, bosqich chegaralari, KPI, tannarx o'zi ishlaydi), mashina holati → mashina holati tarixi. Qo'llab bo'lmasa (ish buyurtmasi aniqlanmagan, chegaradan oshgan, mashina buzilgan) — hodisa tasdiqlash navbatiga tushadi. Ogohlantirish qoidasi (masalan, 60 daqiqada 20+ brak) va 30 daqiqa aloqasiz qurilma — bildirishnomalarda.

**Sinash:** `python scripts/device_simulator.py --key tfd_... --count 10`

## Productionga chiqarish (xavfsizlik sozlamalari)

`ENVIRONMENT=production` bo'lsa server xavfli standart sozlamalar bilan **ishga tushmaydi** (`Settings.validate_for_production`), `/docs` va `/openapi.json` yopiladi.

| O'zgaruvchi | Talab |
|---|---|
| `JWT_SECRET_KEY` | kamida 32 belgili tasodifiy qiymat (`python -c "import secrets;print(secrets.token_hex(48))"`) |
| `SUPERADMIN_PASSWORD` | kamida 12 belgi yoki `BOOTSTRAP_SUPERADMIN=false` |
| `PAYMENT_PROVIDER` | haqiqiy provayder; `demo` faqat `ALLOW_DEMO_PAYMENTS=true` bilan (demo saytlar uchun) |
| `CORS_ORIGINS` | aniq domenlar (`*` taqiqlangan) |
| `AUTO_MIGRATE` | ko'p instansiya/serverless'da `false` va deploy bosqichida `alembic upgrade head` |
| `DB_NULL_POOL` | serverless'da `true` (Neon/PgBouncer pooled URL bilan); oddiy serverda `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` |
| `SELF_REGISTRATION_ENABLED` | sukut bo'yicha `false`: ochiq ro'yxatdan o'tish va Google orqali yangi zavod yopiq — zavod egalarini super admin "Foydalanuvchilar" bo'limida login (email) va parol bilan yaratadi ("+ Yangi fabrika yaratish") |
| `TRUST_PROXY_HEADERS` | proksi (nginx, Vercel) ortida `true` — chastota cheklovi haqiqiy mijoz IP'si bo'yicha ishlaydi |

Chastota cheklovi (`app/core/rate_limit.py`): login — IP bo'yicha 30/5 daq va akkaunt bo'yicha 10/15 daq, ro'yxatdan o'tish — 10/soat, ochiq katalog buyurtmasi — 20/soat, buyurtma qidirish — 10/10 daq. Cheklov jarayon xotirasida: bir nechta instansiyada proksi yoki Redis darajasida ham cheklang.

## Vercel'ga deploy

Bitta Vercel loyihasi: frontend statik (`frontend/dist`), backend — Python funksiya (`api/index.py`), `vercel.json` `/api/*` ni unga yo'naltiradi.

1. vercel.com → **Add New → Project** → shu GitHub repozitoriyni import qiling (sozlamalar `vercel.json` dan olinadi) → **Deploy**.
2. Doimiy baza uchun: loyiha → **Storage → Create Database → Neon (Postgres)** → loyihaga ulang → **Redeploy**.
   Neon ulanmaguncha vaqtinchalik SQLite (`/tmp`) ishlatiladi: sayt ishlaydi, lekin buyurtmalar saqlanib qolmaydi.
3. Ixtiyoriy (Settings → Environment Variables):
   - `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` — berilgandagina admin yaratiladi (standart parol ochiq saytda ishlatilmaydi);
   - `JWT_SECRET_KEY` — berilmasa baza manzilidan hosil qilinadi;
   - `GOOGLE_CLIENT_ID` — Google orqali kirish uchun (Google Console'da Vercel domenini qo'shing).

Ochiq saytda katalog **to'qima brendlar** bilan to'ldiriladi (`backend/scripts/public_demo.py`) — haqiqiy brend nomlari ishlatilmaydi.
Suratlari `frontend/public/media/demo` da; o'zgartirilsa: `cd backend; python -m scripts.public_demo --build-assets`.
Cheklov: serverless'da yuklangan rasmlar (zavod logosi va h.k.) saqlanmaydi — buning uchun keyinroq Vercel Blob / S3 ulash kerak.

## ERP/MES rivojlanish bosqichlari

Har bosqich — alohida migratsiya, testlar va sahifalar; oldingi funksiyalar buzilmaydi, bir funksiya ikki joyda yozilmaydi.

| # | Bosqich | Holat |
|---|---|---|
| 1 | **Ombor + materiallar katalogi + audit log** — materiallar, ombor joylari, kirim/chiqim/ko'chirish/inventarizatsiya jurnali, real qoldiq, minimal qoldiq, BOM → katalog, audit log | ✅ `0006` |
| 2 | **Buyurtma → material** — qo'lda (B2B) buyurtma, topshirish muddati va kechikish, BOM asosida material ehtiyoji, yetishmovchilik, buyurtmaga chiqarish/qaytarish (joy avtomatik), reja vs haqiqiy sarf | ✅ `0007` |
| 3 | **Resurslar** — liniyalar (bosqich, quvvat), smenalar (tungi ham), xodimlar (tabel, me'yor, maxfiy maosh), mashinalar (holat tarixi → downtime/tayyorlik, texnik xizmat jadvali, ta'mir tarixi) | ✅ `0008` |
| 4 | **Ishlab chiqarish** — ish buyurtmalari (buyurtmadan avtomatik), Kesish → Tikuv → Pardoz → Sifat → Qadoqlash marshruti, amal yozuvlari (xodim, mashina, smena, dona, brak sababi, mato sarfi/chiqindi), partiya/quti QR yorliqlari, skaner orqali kuzatuv, xodim KPI | ✅ `0009` |
| 5 | **Ta'minot va logistika** — yetkazib beruvchilar (shartlar, muddatida yetkazish %), xarid buyurtmalari (buyurtma yetishmovchiligidan avtomatik, qisman qabul → ombor kirimi, yo'ldagi miqdor), tayyor mahsulot ombori (ish buyurtmasidan qabul, inventarizatsiya), jo'natmalar (transport, yuk xati QR bilan, buyurtma holati avtomatik) | ✅ `0010` |
| 6 | **Tahlil** — buyurtma tannarxi (chiqim paytidagi material narxi + ishbay/soatbay/oylik ish haqi + ustama %), reja↔fakt va foyda; rahbar dashboardi (rolga qarab); 7 ta hisobot + Excel (CSV); hisoblanadigan bildirishnomalar (o'qilgan holati foydalanuvchi bo'yicha); fabrika sozlamalari (ustama, oylik soat, brak va past foyda chegaralari) | ✅ `0011` |
| 7 | **AI / Computer Vision** — qurilmalar (kalit bilan), hodisa API'si (sanoq, brak, mashina holati, boshqa), bazadagi qoidalar (avtomatik / tasdiqlash / saqlash, ishonch chegarasi, ogohlantirish), tasdiqlash navbati; qo'llash mavjud ishlab chiqarish va mashina mantiqi orqali; simulyator | ✅ `0012` |

**Ombor qoidalari:** qoldiq alohida saqlanmaydi — `stock_movements` jurnalidan (SUM) hisoblanadi; jurnal yozuvlari o'zgarmaydi,
tuzatish faqat inventarizatsiya (ADJUSTMENT) orqali; chiqim joydagi qoldiqdan oshmaydi (PostgreSQL'da advisory lock);
tarixi bor material/joy o'chirilmaydi — nofaol qilinadi. Yangi modullar uchun fabrika bo'yicha ajratish: `app/core/scope.py`,
audit yozish: `app/services/audit_service.record()` (asosiy amal bilan bitta tranzaksiyada).
