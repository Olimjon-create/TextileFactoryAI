@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  TextileCore ishga tushirilmoqda...
echo  (eski yoki qotib qolgan jarayonlar to'xtatilib, hammasi qaytadan yoqiladi)
echo.
wscript.exe "%~dp0windows\start-hidden.vbs" open
echo  Dastur orqa fonda ishlaydi, bu oynani yopsangiz ham to'xtamaydi.
echo  Brauzer 15-30 soniyada o'zi ochiladi: http://localhost:5180
echo.
timeout /t 8 >nul
