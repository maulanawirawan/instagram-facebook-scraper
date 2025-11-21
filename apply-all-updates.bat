@echo off
chcp 65001 >nul
cls
echo.
echo ====================================================
echo   APPLY ALL DASHBOARD UPDATES
echo ====================================================
echo.
echo This will apply all latest improvements:
echo   1. Pull latest changes from Git
echo   2. Update database view
echo   3. Restart frontend container
echo   4. Open dashboard
echo.
pause
cls

echo.
echo Step 1: Pulling latest changes...
echo.
git pull origin claude/fix-docker-network-error-015S38gpeWWWie7U7bRMWS1D
if errorlevel 1 (
    echo ERROR: Git pull failed
    pause
    exit /b 1
)

echo.
echo Step 2: Updating database view...
echo.

REM Create temp SQL file
(
echo CREATE OR REPLACE VIEW v_top_posts AS
echo SELECT id, author, author_url,
echo SUBSTRING^(text, 1, 200^) as text_preview, text,
echo reactions, comments, shares, views,
echo ^(reactions + comments * 2 + shares * 3^) as engagement_score,
echo post_url, share_url, image_url, video_url,
echo has_image, has_video, location,
echo music_title, music_artist,
echo timestamp, timestamp_iso, query_used, filter_year
echo FROM posts WHERE text IS NOT NULL
echo ORDER BY engagement_score DESC LIMIT 100;
) > temp_update.sql

docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < temp_update.sql
if errorlevel 1 (
    echo ERROR: Database update failed
    del temp_update.sql
    pause
    exit /b 1
)

del temp_update.sql
echo Database view updated successfully

echo.
echo Step 3: Restarting frontend...
echo.
docker-compose restart frontend

echo.
echo Step 4: Waiting for services...
timeout /t 5 >nul

cls
echo.
echo ====================================================
echo   ALL UPDATES APPLIED SUCCESSFULLY!
echo ====================================================
echo.
echo IMPORTANT: Clear your browser cache
echo   Chrome/Edge: Press Ctrl+Shift+Delete
echo   Or use Incognito/Private mode
echo.
echo Dashboard URLs:
echo   Local:  http://localhost:8081
echo   Mobile: http://YOUR_IP:8081
echo.
echo Changes applied:
echo   [OK] Simplified professional title
echo   [OK] Fresh data loading (no cache)
echo   [OK] Clean share URLs
echo   [OK] All database fields
echo.
echo ====================================================
echo.

echo Opening dashboard in 3 seconds...
timeout /t 3 >nul
start http://localhost:8081

echo.
pause
