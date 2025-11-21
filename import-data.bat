@echo off
chcp 65001 >nul
cls
echo.
echo ====================================================
echo   IMPORT DATA FROM CSV/JSON TO DATABASE
echo ====================================================
echo.
echo This will import all posts and comments from:
echo   - facebook_data/*.csv
echo   - facebook_data/*.json
echo.
echo Into PostgreSQL database for dashboard display.
echo.
pause
cls

echo.
echo ====================================================
echo   STEP 1: Restart API Container
echo ====================================================
echo.
echo Restarting API to apply latest code changes...
docker-compose restart api
echo.
echo Waiting for API to be ready...
timeout /t 5 >nul
echo.

echo ====================================================
echo   STEP 2: Trigger Data Import
echo ====================================================
echo.
echo Starting import process...
echo.
curl -X POST http://localhost:3002/api/import
echo.
echo.

echo ====================================================
echo   STEP 3: Check Database Stats
echo ====================================================
echo.
timeout /t 2 >nul
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) as total_posts FROM posts;"
echo.

echo ====================================================
echo   IMPORT COMPLETE!
echo ====================================================
echo.
echo Dashboard should now show updated data.
echo Open: http://localhost:8081
echo.
echo TIP: Clear browser cache (Ctrl+Shift+Delete)
echo      or use Incognito mode for fresh view.
echo.
pause
