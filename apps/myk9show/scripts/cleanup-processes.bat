@echo off
echo 🧹 Cleaning up hanging browser and git processes...
echo.

echo Killing Chrome processes...
taskkill /f /im chrome.exe /t 2>nul || echo No Chrome processes found

echo Killing Edge processes...
taskkill /f /im msedge.exe /t 2>nul || echo No Edge processes found

echo Killing Firefox processes...
taskkill /f /im firefox.exe /t 2>nul || echo No Firefox processes found

echo Killing headless_shell processes (main culprit)...
taskkill /f /im headless_shell.exe /t 2>nul || echo No headless_shell processes found

echo Killing other Playwright processes...
taskkill /f /im "Playwright*" /t 2>nul || echo No Playwright processes found

echo Killing any remaining browser helper processes...
taskkill /f /im "chrome_crashpad_handler.exe" /t 2>nul || echo No Chrome crash handlers found
taskkill /f /im "msedgewebview2.exe" /t 2>nul || echo No Edge WebView processes found

echo.
echo Checking git processes...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq git.exe" /fo csv ^| find /c /v ""') do (
    if %%i GTR 5 (
        echo Found many git processes, cleaning up...
        taskkill /f /im git.exe /t 2>nul || echo Git cleanup completed
    ) else (
        echo Git process count is normal
    )
)

echo.
echo ✅ Process cleanup completed!
echo You can now run your tests again.
pause