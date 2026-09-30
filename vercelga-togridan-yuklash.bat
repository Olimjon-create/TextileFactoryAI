@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs
echo.
echo  TextileCore: sayt Vercel'ga to'g'ridan-to'g'ri yuklanadi (GitHub'siz).
echo  Loyiha: textile-factory-ai (.vercel papkasida ulangan)
echo.
echo  1-qadam: Vercel'ga kirish. Brauzer ochiladi - hisobingizga kiring va tasdiqlang.
echo           (Allaqachon kirgan bo'lsangiz, bu qadam o'zi o'tib ketadi.)
echo.
call npx --yes vercel@latest whoami >nul 2>&1 || call npx --yes vercel@latest login
if errorlevel 1 (
  echo.
  echo  XATO: Vercel'ga kirilmadi. Qayta urinib ko'ring.
  pause
  exit /b 1
)
echo.
echo  2-qadam: saytni yuklash (2-4 daqiqa)...
echo.
call npx --yes vercel@latest --prod --yes > "logs\vercel-deploy.log" 2>&1
set RESULT=%errorlevel%
type "logs\vercel-deploy.log"
echo.
if %RESULT%==0 (
  echo  TAYYOR: sayt yangilandi - https://textile-factory-ai-six.vercel.app
  echo  Endi Claude'ga "yuklandi" deb yozing.
) else (
  echo  XATO: yuklash bajarilmadi. logs\vercel-deploy.log faylini Claude'ga yuboring.
)
echo.
pause
