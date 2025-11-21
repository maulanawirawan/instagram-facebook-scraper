@echo off
REM Simple version - just run the commands

echo Creating user fbadmin...
docker exec facebook-postgres psql -U postgres -c "CREATE ROLE fbadmin WITH LOGIN PASSWORD 'fbpass123';" 2>nul
docker exec facebook-postgres psql -U postgres -c "ALTER ROLE fbadmin CREATEDB;" 2>nul

echo Creating database...
docker exec facebook-postgres psql -U postgres -c "CREATE DATABASE facebook_data OWNER fbadmin;" 2>nul
docker exec facebook-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE facebook_data TO fbadmin;"

echo Creating tables...
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < database\init.sql

echo.
echo Testing connection...
node test-db-connection.js

echo.
echo Done! Now run: node facebookkey.js
pause
