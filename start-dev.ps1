$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

if (-not (Test-Path (Join-Path $backend 'venv'))) {
    Write-Host "backend\venv topilmadi. Avval README dagi o'rnatish qadamlarini bajaring." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $backend '.env'))) {
    Copy-Item (Join-Path $backend '.env.example') (Join-Path $backend '.env')
    Write-Host "backend\.env yaratildi (.env.example dan). DATABASE_URL ni tekshiring." -ForegroundColor Yellow
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'npm install bajarilmoqda...' -ForegroundColor Yellow
    Push-Location $frontend; npm install; Pop-Location
}

if (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue) {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object {
            ($_.CommandLine -match 'uvicorn app\.main:app' -or $_.CommandLine -match 'multiprocessing\.spawn') -and
            -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue)
        } |
        ForEach-Object {
            Write-Host "Yetim backend jarayoni to'xtatildi (PID $($_.ProcessId))" -ForegroundColor Yellow
            taskkill /PID $_.ProcessId /T /F | Out-Null
        }
    Start-Sleep -Seconds 1
}

foreach ($port in 8001, 5180) {
    $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($busy) {
        $name = (Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host "Port $port band ($name). O'sha dasturni yoping yoki bu oynalar allaqachon ochiq." -ForegroundColor Red
        exit 1
    }
}

Start-Process powershell -WorkingDirectory $backend -ArgumentList '-NoExit', '-Command', `
    '$Host.UI.RawUI.WindowTitle = ''TFAI backend :8001''; .\venv\Scripts\python -m uvicorn app.main:app --reload --port 8001'
Start-Process powershell -WorkingDirectory $frontend -ArgumentList '-NoExit', '-Command', `
    '$Host.UI.RawUI.WindowTitle = ''TFAI frontend :5180''; npm run dev'

Write-Host ''
Write-Host 'Backend:  http://localhost:8001/docs' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:5180' -ForegroundColor Green
Write-Host 'Kirish:   admin@textile.ai / Admin12345 (backend\.env dagi SUPERADMIN_*)' -ForegroundColor Green
