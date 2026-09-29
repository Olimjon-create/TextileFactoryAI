# TextileCore - to'xtatish: qo'riqchi, backend (8001) va frontend (5180)
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root 'logs\supervisor.pid'
if (Test-Path $pidFile) {
    $old = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($old) {
        $p = Get-Process -Id ([int]$old) -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -match 'powershell') { Stop-Process -Id ([int]$old) -Force -ErrorAction SilentlyContinue }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
foreach ($port in 8001, 5180) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { if ($_ -gt 4) { & taskkill.exe /PID $_ /T /F 2>$null | Out-Null } }
}
Write-Host "TextileCore to'xtatildi."
