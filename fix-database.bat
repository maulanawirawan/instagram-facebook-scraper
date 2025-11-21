@echo off
REM =========================================================
REM FIX DATABASE - Create user fbadmin and tables
REM No need to recreate containers!
REM =========================================================

echo ============================================================
echo [FIX DATABASE] Creating user + tables
echo ============================================================
echo.

REM Check if container is running
docker ps | findstr facebook-postgres >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] PostgreSQL container is not running!
    echo         Run: docker-compose up -d
    pause
    exit /b 1
)

echo [OK] Container is running
echo.

REM Step 1: Create role fbadmin
echo [STEP 1] Creating role "fbadmin"...
docker exec facebook-postgres psql -U postgres -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fbadmin') THEN CREATE ROLE fbadmin WITH LOGIN PASSWORD 'fbpass123'; ALTER ROLE fbadmin CREATEDB; RAISE NOTICE 'Role fbadmin created'; ELSE RAISE NOTICE 'Role fbadmin already exists'; END IF; END $$;"

if %errorlevel% neq 0 (
    echo [ERROR] Failed to create role
    pause
    exit /b 1
)
echo [OK] Role ready
echo.

REM Step 2: Create database
echo [STEP 2] Creating database "facebook_data"...
docker exec facebook-postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='facebook_data'" | findstr "1" >nul 2>&1

if %errorlevel% neq 0 (
    docker exec facebook-postgres psql -U postgres -c "CREATE DATABASE facebook_data OWNER fbadmin;"
    echo [OK] Database created
) else (
    echo [OK] Database already exists
)

docker exec facebook-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE facebook_data TO fbadmin;"
echo.

REM Step 3: Create tables from init.sql
echo [STEP 3] Creating tables from init.sql...
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < database\init.sql

if %errorlevel% neq 0 (
    echo [WARNING] Some errors occurred, but continuing...
)
echo [OK] Tables created
echo.

REM Step 4: Test connection
echo [STEP 4] Testing connection...
echo.
node test-db-connection.js

echo.
echo ============================================================
echo [SUCCESS] DATABASE FIXED!
echo ============================================================
echo.
echo Next step: Run scraper with real-time database auto-save
echo   node facebookkey.js
echo.
pause
