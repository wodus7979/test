@echo off
chcp 65001 >nul
title WebCraft - AI 다리
cd /d "%~dp0.."
python tools\ai-bridge.py %*
pause
