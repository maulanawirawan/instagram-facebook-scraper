@echo off
echo ====================================================
echo  UPDATE DATABASE VIEW - Fix Dashboard Display
echo ====================================================
echo.
echo This script will update the database view to include
echo all necessary fields for the dashboard.
echo.
pause

echo Updating database view...
echo.

REM Create SQL file
(
echo CREATE OR REPLACE VIEW v_top_posts AS
echo SELECT
echo     id,
echo     author,
echo     author_url,
echo     SUBSTRING^(text, 1, 200^) as text_preview,
echo     text,
echo     reactions,
echo     comments,
echo     shares,
echo     views,
echo     ^(reactions + comments * 2 + shares * 3^) as engagement_score,
echo     post_url,
echo     share_url,
echo     image_url,
echo     video_url,
echo     has_image,
echo     has_video,
echo     location,
echo     music_title,
echo     music_artist,
echo     timestamp,
echo     timestamp_iso,
echo     query_used,
echo     filter_year
echo FROM posts
echo WHERE text IS NOT NULL
echo ORDER BY engagement_score DESC
echo LIMIT 100;
echo.
echo SELECT 'View updated successfully! Total posts: ' ^|^| COUNT^(*^) as status FROM v_top_posts;
) > temp_update.sql

REM Execute SQL
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < temp_update.sql

REM Cleanup
del temp_update.sql

echo.
echo ====================================================
echo Database view updated!
echo.
echo Now restart the frontend container:
echo   docker-compose restart frontend
echo.
echo Then test the dashboard:
echo   Local:  http://localhost:8081
echo   Mobile: http://YOUR_IP:8081
echo ====================================================
echo.
pause
