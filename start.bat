@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist .env copy .env.example .env >nul
start "" http://localhost:3000
node server.js
pause
