@echo off
echo ====================================================
echo  FACEBOOK DASHBOARD - LAN ACCESS SETUP
echo ====================================================
echo.

echo [1/3] Checking your local IP address...
echo.
ipconfig | findstr /i "IPv4"
echo.

echo [2/3] Your dashboard URLs:
echo.
echo   Dashboard:  http://YOUR_IP:8080
echo   API:        http://YOUR_IP:3000
echo   pgAdmin:    http://YOUR_IP:5050
echo.

echo [3/3] Opening Windows Firewall rules...
echo.
echo NOTE: This requires Administrator privileges!
echo       Right-click this file and "Run as Administrator"
echo.

net session >nul 2>&1
if %errorLevel% == 0 (
    echo Adding firewall rules...
    netsh advfirewall firewall add rule name="Facebook Dashboard Port 8080" dir=in action=allow protocol=TCP localport=8080
    netsh advfirewall firewall add rule name="Facebook API Port 3000" dir=in action=allow protocol=TCP localport=3000
    netsh advfirewall firewall add rule name="Facebook pgAdmin Port 5050" dir=in action=allow protocol=TCP localport=5050
    echo.
    echo ✓ Firewall rules added successfully!
    echo.
    echo Your friends can now access the dashboard using your IP address.
) else (
    echo ✗ Not running as Administrator!
    echo   Right-click this file and select "Run as Administrator"
)

echo.
echo ====================================================
pause
