@echo off
cd /d "%~dp0"

rem One-click local start, for the desktop shortcut. Runs the same `npm run dev`
rem as by hand: Vite on 5173 (the app) plus the Node server on 8787 (keys, the
rem model calls, ffmpeg and the background video render queue). Both are needed
rem - server-side video rendering only works with the local server running.
rem
rem The script calls itself with --open as a small background helper: it waits
rem for Vite to answer, then opens the browser, so the tab can't land on a
rem connection error during a cold start. `npm run dev` itself stays in the
rem FOREGROUND of this window, so closing the window stops SlideGen.

if "%~1"=="--open" goto :opener

title Upshift SlideGen

if not exist "node_modules" (
  echo First run - installing dependencies, this takes a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause >nul
    exit /b 1
  )
)

echo Starting SlideGen on http://localhost:5173 ...
start "" /b cmd /c ""%~f0" --open"
call npm run dev

echo.
echo SlideGen stopped. Press any key to close.
pause >nul
exit /b 0

:opener
set /a tries=0
:wait
set /a tries+=1
curl -s -o nul http://localhost:5173 && goto :ready
if %tries% geq 90 exit /b 1
timeout /t 1 /nobreak >nul
goto :wait
:ready
start "" http://localhost:5173
exit /b 0
