@echo off
chcp 65001 >nul
title WebCraft
cd /d "%~dp0.."
echo.
echo   WebCraft 를 시작합니다.
echo.

rem 단일 파일이 있으면 그냥 브라우저로 연다 (가장 간단한 방법)
if exist "dist\minecraft.html" (
  echo   dist\minecraft.html 을 기본 브라우저로 엽니다.
  start "" "dist\minecraft.html"
  echo.
  echo   창이 열리지 않으면 dist\minecraft.html 을 직접 더블클릭하세요.
  timeout /t 4 >nul
  exit /b
)

rem 소스로 실행하는 경우에는 로컬 서버를 띄운다
where python >nul 2>nul
if %errorlevel%==0 (
  echo   로컬 서버를 8123 포트로 띄웁니다. 이 창을 닫으면 서버가 멈춥니다.
  start "" "http://localhost:8123/index.html"
  python -m http.server 8123 --directory web
  exit /b
)

echo   python 을 찾을 수 없습니다. dist\minecraft.html 을 더블클릭해 주세요.
pause
