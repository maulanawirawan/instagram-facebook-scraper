@echo off
echo ====================================================
echo  FIX PORT CONFLICTS - Update to Port 5434
echo ====================================================
echo.

echo Current .env file:
echo --------------------------------------------------
type .env
echo --------------------------------------------------
echo.

echo Creating updated .env with port 5434...
(
echo # PostgreSQL Configuration
echo POSTGRES_USER=fbadmin
echo POSTGRES_PASSWORD=fbpass123
echo POSTGRES_DB=facebook_data
echo POSTGRES_PORT=5434
echo.
echo # pgAdmin Configuration
echo PGADMIN_EMAIL=admin@facebook.local
echo PGADMIN_PASSWORD=admin123
echo PGADMIN_PORT=5051
echo.
echo # Backend API Configuration
echo NODE_ENV=development
echo API_PORT=3002
echo.
echo # Frontend Configuration
echo FRONTEND_PORT=8081
echo.
echo # Scraper API Connection
echo API_BASE_URL=http://localhost:3002
) > .env

echo.
echo Updated .env file:
echo --------------------------------------------------
type .env
echo --------------------------------------------------
echo.

echo Stopping old containers...
docker stop facebook-frontend facebook-api facebook-postgres facebook-pgadmin 2>nul

echo.
echo Starting services with new configuration...
docker-compose up -d

echo.
echo Waiting for services to start...
timeout /t 5 >nul

echo.
echo Service Status:
docker ps | findstr facebook

echo.
echo ====================================================
echo Dashboard URLs:
echo   Local:  http://localhost:8081
echo   LAN:    http://YOUR_IP:8081
echo ====================================================
echo.

echo Opening dashboard...
timeout /t 2 >nul
start http://localhost:8081

pause
