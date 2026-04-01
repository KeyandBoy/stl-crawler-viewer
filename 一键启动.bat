@echo off
echo ==============================================
echo          STL Model Tool - One-Click Start
echo          Auto Start Service + Open Browser
echo ==============================================
echo.

:: 启动 Next.js 开发服务
start cmd /k "npm run dev"

:: 等待3秒（等服务启动完成）
timeout /t 3 /nobreak >nul

:: 自动打开浏览器访问页面
start http://localhost:3000

echo.
echo ✅ Startup complete! Browser opened automatically.
echo.
pause