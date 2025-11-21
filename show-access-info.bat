@echo off
chcp 65001 >nul
cls
echo.
echo ====================================================
echo   DASHBOARD CONNECTION INFO
echo ====================================================
echo.

REM Get WiFi IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4" ^| findstr /V "127.0.0.1"') do (
    set IP=%%a
    set IP=!IP: =!
    goto :found
)

:found
echo Main WiFi IP: %IP%
echo.
echo ====================================================
echo   SHARE THESE URLS:
echo ====================================================
echo.
echo Local (this laptop):
echo   http://localhost:8081
echo.
echo Mobile/Other devices (same WiFi):
echo   http://%IP%:8081
echo.
echo ====================================================
echo.

echo Opening QR Code for easy sharing...
echo (Scan with phone camera to access dashboard)
echo.
start https://api.qrserver.com/v1/create-qr-code/?size=400x400^&data=http://%IP%:8081

echo QR code opened in browser!
echo.
echo Network changed? Run this script again to get new URLs.
echo.
pause
