@echo off
echo.
echo ====================================================
echo   FIX API CONNECTION - Update .env
echo ====================================================
echo.
echo This will update your .env file to use IPv4 address
echo instead of localhost to prevent IPv6 connection issues.
echo.
pause

echo.
echo Checking current .env file...
echo.

if not exist .env (
    echo .env file not found! Creating from .env.example...
    copy .env.example .env
)

echo Current API_BASE_URL:
type .env | findstr API_BASE_URL
echo.

echo Updating to use 127.0.0.1 (IPv4)...
powershell -Command "(Get-Content .env) -replace 'API_BASE_URL=http://localhost:', 'API_BASE_URL=http://127.0.0.1:' | Set-Content .env"

echo.
echo Updated API_BASE_URL:
type .env | findstr API_BASE_URL
echo.

echo ====================================================
echo   UPDATE COMPLETE!
echo ====================================================
echo.
echo The scraper will now connect to API using IPv4.
echo.
echo Next steps:
echo   1. Run: node facebookkey
echo   2. Scraper will auto-detect API connection
echo.
pause
