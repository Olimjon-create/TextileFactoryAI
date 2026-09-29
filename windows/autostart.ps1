param([switch]$Disable)
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'TextileFactoryAI.lnk'
if ($Disable) {
    Remove-Item $link -Force -ErrorAction SilentlyContinue
    Write-Host "Avtostart o'chirildi."
    exit 0
}
$vbs = Join-Path $PSScriptRoot 'start-hidden.vbs'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($link)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + $vbs + '"'
$s.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$s.Description = 'TextileCore - backend va frontendni ishga tushirish'
$s.Save()
Write-Host "Avtostart yoqildi: $link"
Write-Host "Endi har safar kompyuterga kirganingizda dastur o'zi ishga tushadi."
