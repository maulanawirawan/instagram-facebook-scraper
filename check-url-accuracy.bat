@echo off
echo ====================================================
echo  CHECK URL ACCURACY - Compare URLs with Content
echo ====================================================
echo.
echo This will show top posts with URLs for manual verification
echo.
pause

echo.
echo Fetching data from database...
echo.

docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT id, author, SUBSTRING(text, 1, 120) as content, reactions, comments, shares, share_url FROM posts ORDER BY (reactions + comments * 2 + shares * 3) DESC LIMIT 15;"

echo.
echo ====================================================
echo MANUAL VERIFICATION:
echo.
echo 1. Pick a post from the list above
echo 2. Copy the share_url
echo 3. Open it in browser
echo 4. Check if the content matches
echo.
echo If URLs don't match content, the scraper might be:
echo   - Grabbing URL from adjacent posts
echo   - Using wrong DOM selectors
echo   - Post element scope too wide
echo ====================================================
echo.

pause

echo.
echo Checking for duplicate share_urls...
echo.

docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < database\check_url_mismatch.sql

echo.
echo ====================================================
echo Results above show:
echo 1. Top posts with URLs
echo 2. Duplicate URLs (same URL for different content)
echo 3. URL-author alignment check
echo 4. Comparison of post_url vs share_url
echo ====================================================
echo.
pause
