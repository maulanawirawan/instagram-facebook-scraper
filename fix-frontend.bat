@echo off
echo ====================================================
echo  FIX FRONTEND DASHBOARD - Rebuild Container
echo ====================================================
echo.

echo [Step 1/5] Stopping frontend container...
docker stop facebook-frontend
docker rm facebook-frontend
echo.

echo [Step 2/5] Removing old frontend image...
docker rmi facebook-keyword-frontend
echo.

echo [Step 3/5] Rebuilding frontend container...
docker-compose build --no-cache frontend
echo.

echo [Step 4/5] Starting frontend container...
docker-compose up -d frontend
echo.

echo [Step 5/5] Checking container status...
docker ps | findstr facebook-frontend
echo.

echo ====================================================
echo Testing URLs:
echo.
echo   Local:      http://localhost:8080
echo   Dashboard:  http://localhost:8080/dashboard.html
echo.
echo Checking your IP for LAN access...
ipconfig | findstr /i "IPv4"
echo.
echo   LAN Access: http://YOUR_IP:8080
echo ====================================================
echo.

echo Opening browser...
timeout /t 2 >nul
start http://localhost:8080

echo.
echo ✓ Done! Check your browser.
echo.
pause
