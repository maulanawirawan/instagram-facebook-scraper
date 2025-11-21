@echo off
echo ====================================================
echo  RESTART DOCKER SERVICES FOR LAN ACCESS
echo ====================================================
echo.
echo This will restart all Docker services with proper
echo network binding to allow LAN access.
echo.
pause

echo [Step 1/4] Stopping all services...
docker-compose down
echo.

echo [Step 2/4] Starting services with new configuration...
docker-compose up -d
echo.

echo [Step 3/4] Waiting for services to be ready...
timeout /t 10 >nul
echo.

echo [Step 4/4] Checking service status...
docker-compose ps
echo.

echo ====================================================
echo Service URLs:
echo.
echo   Dashboard:  http://localhost:8080
echo   API:        http://localhost:3000
echo   pgAdmin:    http://localhost:5050
echo.

echo Checking your IP for LAN access...
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    set IP=%%a
    set IP=!IP: =!
    echo   LAN Dashboard:  http://!IP!:8080
    echo   LAN API:        http://!IP!:3000
    echo   LAN pgAdmin:    http://!IP!:5050
    echo.
)
echo ====================================================
echo.

echo Opening local dashboard...
timeout /t 2 >nul
start http://localhost:8080

echo.
echo ✓ Done! Share the LAN URLs above with your friends.
echo   Make sure Windows Firewall is configured (run setup-lan-access.bat as Admin)
echo.
pause
