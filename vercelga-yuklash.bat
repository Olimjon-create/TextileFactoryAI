@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs
echo.
echo  TextileCore: o'zgarishlar GitHub'ga yuklanmoqda (Vercel saytni o'zi yangilaydi)...
echo.
call :run > "logs\vercel-push.log" 2>&1
type "logs\vercel-push.log"
echo.
findstr /C:"PUSH_OK" "logs\vercel-push.log" >nul && (
  echo  TAYYOR: GitHub'ga yuklandi. Vercel 1-3 daqiqada saytni yangilaydi.
) || (
  echo  XATO: yuklash bajarilmadi. Yuqoridagi xabarni Claude'ga yuboring.
)
echo.
pause
exit /b

:run
where git || (echo GIT_TOPILMADI & exit /b 1)
echo --- joriy tarmoq:
git rev-parse --abbrev-ref HEAD
echo --- o'zgargan fayllar:
git add -A
git status --short
git commit -m "Yangi dizayn, davomat bo'limi, dashboard va tushum diagrammalari, Windows avtostart"
echo --- GitHub'ga push:
git push origin HEAD:main && echo PUSH_OK
exit /b
