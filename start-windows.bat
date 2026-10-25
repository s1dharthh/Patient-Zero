@echo off
cd /d "%~dp0"
echo Starting Patient Zero at http://localhost:3000
echo Keep this window open while playing.
node server\index.js
pause
