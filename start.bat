@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

set "PYTHON_CMD="
where py >NUL 2>&1
if not errorlevel 1 (
  for /f "usebackq delims=" %%I in (`py -3 -c "import sys; print(sys.executable)" 2^>NUL`) do set "PYTHON_CMD=%%I"
)

if not defined PYTHON_CMD (
  where python >NUL 2>&1
  if not errorlevel 1 (
    for /f "usebackq delims=" %%I in (`python -c "import sys; print(sys.executable)" 2^>NUL`) do set "PYTHON_CMD=%%I"
  )
)

if not defined PYTHON_CMD (
  echo Python 3 was not found. Install Python 3 and try again.
  pause
  exit /b 1
)

echo Using Python: "%PYTHON_CMD%"
echo Checking Python ML service dependencies...
"%PYTHON_CMD%" -c "import fastapi, uvicorn" >NUL 2>&1
if errorlevel 1 (
  echo Installing Python ML service dependencies...
  "%PYTHON_CMD%" -m pip install -r scripts\requirements.txt
  if errorlevel 1 (
    echo Failed to install Python dependencies.
    pause
    exit /b 1
  )
)

set "ML_PID="
call :check_health
if errorlevel 1 (
  echo Starting ML service on http://127.0.0.1:8000 ...
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$p = Start-Process -FilePath '%PYTHON_CMD%' -ArgumentList 'scripts\\ml_service.py' -PassThru -WindowStyle Hidden; $p.Id"`) do set "ML_PID=%%I"

  if not defined ML_PID (
    echo WARNING: Failed to capture ML service PID. Starting fallback background process.
    start "ML Service" /B "%PYTHON_CMD%" scripts\ml_service.py
  )

  call :wait_for_ml_health
  if not errorlevel 1 (
    echo ML service is running.
  ) else (
    echo WARNING: ML service health check timed out. FastAPI fallback to Python spawn will be used.
  )
) else (
  echo ML service is already running.
)

echo Starting development server on http://localhost:3000 ...
npm run dev
set "DEV_EXIT=%ERRORLEVEL%"

if defined ML_PID (
  echo Stopping ML service (PID %ML_PID%)...
  taskkill /PID %ML_PID% /T /F >NUL 2>&1
)

if not "%DEV_EXIT%"=="0" (
  echo.
  echo Development server exited with an error.
  pause
  exit /b %DEV_EXIT%
)

exit /b 0

:check_health
"%PYTHON_CMD%" -c "import json,sys,urllib.request; response = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=1); payload = json.loads(response.read().decode('utf-8')); sys.exit(0 if payload.get('status') == 'ok' else 1)" >NUL 2>&1
exit /b %ERRORLEVEL%

:wait_for_ml_health
for /L %%I in (1,1,30) do (
  call :check_health
  if not errorlevel 1 exit /b 0
  timeout /t 1 /nobreak >NUL
)
exit /b 1
