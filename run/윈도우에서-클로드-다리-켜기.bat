@echo off
chcp 65001 >nul
title WebCraft - 클로드 다리
cd /d "%~dp0.."
python tools\claude-bridge.py %*
pause
