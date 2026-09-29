param([switch]$OpenBrowser)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$pidFile = Join-Path $logs 'supervisor.pid'
$logFile = Join-Path $logs 'supervisor.log'

$BackendUrl = 'http://127.0.0.1:8001/health'
$FrontendUrl = 'http://localhost:5180/'

function Log([string]$msg) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
    try { Add-Content -Path $logFile -Value $line -Encoding UTF8 } catch {}
}

function Test-Url([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
        return ($r.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Stop-Tree([int]$procId) {
    if ($procId -gt 4) { & taskkill.exe /PID $procId /T /F 2>$null | Out-Null }
}

function Stop-Port([int]$port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Tree $_ }
}

function Stop-OrphanUvicorn {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            ($_.CommandLine -match 'uvicorn app\.main:app' -or $_.CommandLine -match 'multiprocessing\.spawn') -and
            -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue)
        } |
        ForEach-Object { Stop-Tree $_.ProcessId }
}

if (Test-Path $pidFile) {
    $old = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($old -and ([int]$old -ne $PID)) {
        $p = Get-Process -Id ([int]$old) -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -match 'powershell') { Stop-Process -Id ([int]$old) -Force -ErrorAction SilentlyContinue }
    }
}
Set-Content -Path $pidFile -Value $PID

$script:be = $null
$script:fe = $null

function Start-Backend {
    if ($script:be -and -not $script:be.HasExited) { Stop-Tree $script:be.Id }
    Stop-Port 8001
    Stop-OrphanUvicorn
    Start-Sleep -Seconds 1
    $py = Join-Path $backend 'venv\Scripts\python.exe'
    if (-not (Test-Path $py)) { Log "XATO: $py topilmadi (backend\venv o'rnatilmagan)"; return }
    $cmd = '"{0}" -m uvicorn app.main:app --host 127.0.0.1 --port 8001 > "{1}" 2>&1' -f $py, (Join-Path $logs 'backend.log')
    $script:be = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$cmd`"" -WorkingDirectory $backend -WindowStyle Hidden -PassThru
    Log "Backend ishga tushirildi (PID $($script:be.Id))"
}

function Start-Frontend {
    if ($script:fe -and -not $script:fe.HasExited) { Stop-Tree $script:fe.Id }
    Stop-Port 5180
    Start-Sleep -Seconds 1
    if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
        Log 'node_modules yo''q - npm install bajarilmoqda'
        $inst = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"npm install > "{0}" 2>&1"' -f (Join-Path $logs 'npm-install.log')) -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -Wait
    }
    $cmd = 'npm run dev > "{0}" 2>&1' -f (Join-Path $logs 'frontend.log')
    $script:fe = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$cmd`"" -WorkingDirectory $frontend -WindowStyle Hidden -PassThru
    Log "Frontend ishga tushirildi (PID $($script:fe.Id))"
}

function Wait-Url([string]$url, [int]$seconds) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Test-Url $url) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

Log '---- Qo''riqchi ishga tushdi ----'
Start-Backend
Start-Frontend

$beOk = Wait-Url $BackendUrl 90
$feOk = Wait-Url $FrontendUrl 90
Log ("Tayyor: backend={0}, frontend={1}" -f $beOk, $feOk)
if ($OpenBrowser) { Start-Process 'http://localhost:5180' }

function Invoke-DailyBackup {
    $dir = Join-Path $backend 'backups'
    $stamp = Get-Date -Format 'yyyyMMdd'
    if (Test-Path (Join-Path $dir "textilecore-$stamp-*.db")) { return }
    if ($script:bk -and -not $script:bk.HasExited) { return }
    $py = Join-Path $backend 'venv\Scripts\python.exe'
    if (-not (Test-Path $py)) { return }
    $cmd = '"{0}" -m scripts.backup_db >> "{1}" 2>&1' -f $py, (Join-Path $logs 'backup.log')
    $script:bk = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$cmd`"" -WorkingDirectory $backend -WindowStyle Hidden -PassThru
    Log 'Kunlik zaxira boshlandi'
}
$script:bk = $null

$beFail = 0
$feFail = 0
while ($true) {
    Start-Sleep -Seconds 20
    Invoke-DailyBackup

    if ($script:be.HasExited -or -not (Test-Url $BackendUrl)) { $beFail++ } else { $beFail = 0 }
    if ($script:be.HasExited -or $beFail -ge 3) {
        Log 'Backend javob bermayapti - qayta ishga tushirilmoqda'
        Start-Backend
        $beFail = 0
        Wait-Url $BackendUrl 90 | Out-Null
    }

    if ($script:fe.HasExited -or -not (Test-Url $FrontendUrl)) { $feFail++ } else { $feFail = 0 }
    if ($script:fe.HasExited -or $feFail -ge 3) {
        Log 'Frontend javob bermayapti - qayta ishga tushirilmoqda'
        Start-Frontend
        $feFail = 0
        Wait-Url $FrontendUrl 90 | Out-Null
    }
}
