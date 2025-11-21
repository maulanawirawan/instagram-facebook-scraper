@echo off
echo Creating Dockerfile for frontend...

(
echo FROM nginx:alpine
echo.
echo # Copy frontend files
echo COPY . /usr/share/nginx/html/
echo.
echo EXPOSE 80
echo.
echo CMD ["nginx", "-g", "daemon off;"]
) > frontend\Dockerfile

echo.
echo Dockerfile created successfully!
echo.
echo Building and starting frontend container on port 8081...
docker-compose up -d --build frontend

echo.
echo Done! Access dashboard at:
echo   http://localhost:8081
echo   http://YOUR_IP:8081
echo.
pause
