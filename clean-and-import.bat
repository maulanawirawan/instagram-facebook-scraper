@echo off
chcp 65001 >nul
cls
echo.
echo ====================================================
echo   CLEAN DATABASE AND FRESH IMPORT
echo ====================================================
echo.
echo WARNING: This will DELETE ALL posts and comments
echo          from the database and import fresh data
echo          from CSV/JSON files.
echo.
echo Current data:
echo   - Database: Will be cleared
echo   - CSV Files: Will be imported
echo.
pause
cls

echo.
echo ====================================================
echo   STEP 1: Checking Docker Containers
echo ====================================================
echo.
docker ps | findstr facebook
echo.

echo ====================================================
echo   STEP 2: Cleaning Database
echo ====================================================
echo.
echo Deleting all posts...
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "DELETE FROM posts;"
echo.
echo Deleting all comments...
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "DELETE FROM comments;"
echo.
echo Resetting sequences...
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "ALTER SEQUENCE posts_id_seq RESTART WITH 1;"
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "ALTER SEQUENCE comments_id_seq RESTART WITH 1;"
echo.
echo ✅ Database cleaned!
echo.

echo ====================================================
echo   STEP 3: Verify Clean Database
echo ====================================================
echo.
echo Posts count:
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) as posts FROM posts;"
echo.
echo Comments count:
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) as comments FROM comments;"
echo.
pause

echo.
echo ====================================================
echo   STEP 4: Restart API Container
echo ====================================================
echo.
docker-compose restart api
echo.
echo Waiting for API to be ready...
timeout /t 5 >nul
echo.

echo ====================================================
echo   STEP 5: Check CSV/JSON Files
echo ====================================================
echo.
echo CSV Files:
dir facebook_data\*.csv
echo.
echo JSON Files:
dir facebook_data\*.json
echo.
pause

echo ====================================================
echo   STEP 6: Fresh Import from CSV/JSON
echo ====================================================
echo.
echo Starting import process...
echo.
curl -X POST http://127.0.0.1:3002/api/import
echo.
echo.
echo Waiting for import to complete...
timeout /t 5 >nul
echo.

echo ====================================================
echo   STEP 7: Verify Import Results
echo ====================================================
echo.
echo Final database count:
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) as total_posts FROM posts;"
echo.
echo Top 5 posts:
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT id, author, LEFT(text, 50) as text_preview, reactions, comments, shares FROM posts ORDER BY id DESC LIMIT 5;"
echo.

echo ====================================================
echo   IMPORT COMPLETE!
echo ====================================================
echo.
echo ✅ Database cleaned and fresh import completed!
echo.
echo Next steps:
echo   1. Open dashboard: http://localhost:8081
echo   2. Clear browser cache (Ctrl+Shift+Delete)
echo   3. Refresh dashboard to see fresh data
echo.
echo TIP: If data still not showing, try:
echo      - Clear browser cache completely
echo      - Use Incognito/Private mode
echo      - Hard refresh (Ctrl+F5)
echo.
pause
