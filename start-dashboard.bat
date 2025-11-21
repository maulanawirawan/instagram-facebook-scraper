@echo off
chcp 65001 >nul
cls
echo.
echo ====================================================
echo   FACEBOOK DASHBOARD - QUICK START
echo ====================================================
echo.
echo Starting all services...
docker-compose up -d

echo.
echo Waiting for services to be ready...
timeout /t 8 >nul

echo.
echo ====================================================
echo   DASHBOARD ACCESS INFORMATION
echo ====================================================
echo.

REM Get all IPv4 addresses
echo Your device IPs:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    set IP=%%a
    setlocal enabledelayedexpansion
    set IP=!IP: =!
    echo   - !IP!
    endlocal
)

echo.
echo ====================================================
echo   HOW TO ACCESS DASHBOARD:
echo ====================================================
echo.
echo [FROM THIS LAPTOP]
echo   http://localhost:8081
echo.
echo [FROM OTHER DEVICES (same WiFi)]
echo   1. Find your main IP above (usually 192.168.x.x)
echo   2. Share this URL to others:
echo.

REM Get main WiFi IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4" ^| findstr /V "127.0.0.1"') do (
    set MAINIP=%%a
    set MAINIP=!MAINIP: =!
    goto :showurl
)

:showurl
echo      http://%MAINIP%:8081
echo.
echo   3. Or scan QR code (opening browser...)
timeout /t 2 >nul
start https://api.qrserver.com/v1/create-qr-code/?size=300x300^&data=http://%MAINIP%:8081

echo.
echo ====================================================
echo   TROUBLESHOOTING:
echo ====================================================
echo.
echo - Make sure all devices connected to SAME WiFi
echo - If can't access, run: setup-lan-access.bat (as Admin)
echo - IP changes when you switch WiFi networks
echo.

echo Opening local dashboard...
timeout /t 2 >nul
start http://localhost:8081

echo.
echo Press any key to see live logs...
pause >nul

echo.
echo ====================================================
echo   LIVE LOGS (Ctrl+C to exit)
echo ====================================================
docker-compose logs -f --tail=50 api frontend
