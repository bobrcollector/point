#Requires -RunAsAdministrator
# Repair WSL for Docker. Run: npm run repair:wsl

$ErrorActionPreference = 'Continue'
$logPath = Join-Path $PSScriptRoot '.repair-wsl.log'
Start-Transcript -Path $logPath -Force | Out-Null

function Stop-WslCommand {
    param(
        [string[]]$Arguments,
        [int]$TimeoutSec = 20,
        [string]$Label = 'wsl'
    )
    $proc = Start-Process wsl.exe -ArgumentList $Arguments -PassThru -NoNewWindow
    if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
        Stop-Process $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  $Label timeout after ${TimeoutSec}s" -ForegroundColor Yellow
        return $false
    }
    return $true
}

Write-Host '=== Point: repair WSL + Docker ===' -ForegroundColor Cyan
Write-Host "Log: $logPath"

Write-Host "`n[1/7] Stop Docker..."
Get-Process | Where-Object { $_.ProcessName -match 'docker|Docker|com\.docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-Service com.docker.service -Force -ErrorAction SilentlyContinue

Write-Host "`n[2/7] Kill stuck WSL..."
Get-Process wsl, wslrelay, vmmemWSL, vmwp -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$stuck = (Get-Process wsl -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "  remaining wsl.exe: $stuck"

Write-Host "`n[3/7] WSL shutdown..."
Stop-WslCommand -Arguments @('--shutdown') -TimeoutSec 20 -Label 'wsl --shutdown' | Out-Null
Start-Sleep -Seconds 3

Write-Host "`n[4/7] Restart WSL Service..."
net stop WSLService /y 2>&1 | Out-Null
Start-Sleep -Seconds 3
net start WSLService 2>&1
Start-Sleep -Seconds 5

Write-Host "`n[5/7] Update WSL..."
Stop-WslCommand -Arguments @('--update', '--web-download') -TimeoutSec 120 -Label 'wsl --update' | Out-Null

Write-Host "`n[6/7] Check distros..."
$listFile = Join-Path $env:TEMP 'point-wsl-list.txt'
$listOk = $false
$list = Start-Process wsl.exe -ArgumentList '-l', '-v', '--all' -PassThru -NoNewWindow -RedirectStandardOutput $listFile
if ($list.WaitForExit(15000)) {
    Get-Content $listFile -ErrorAction SilentlyContinue
    $listOk = $list.ExitCode -eq 0
}
else {
    Stop-Process $list.Id -Force -ErrorAction SilentlyContinue
    Write-Host '  wsl -l -v timeout' -ForegroundColor Yellow
}

if (-not $listOk) {
    Write-Host "`nWSL still not responding." -ForegroundColor Yellow
    Write-Host 'Reboot PC, then run: npm run reset:docker-wsl' -ForegroundColor Yellow
    Write-Host 'Or Docker Desktop -> Troubleshoot -> Reset to factory defaults' -ForegroundColor Yellow
    Stop-Transcript | Out-Null
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host "`n[7/7] Start Docker Desktop..."
$dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (Test-Path $dockerExe) {
    Start-Process $dockerExe
    Write-Host '  Docker Desktop started. Wait 1-2 min, then run: docker ps' -ForegroundColor Green
}
else {
    Write-Host "  Docker Desktop not found: $dockerExe" -ForegroundColor Red
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host "Log: $logPath"
Stop-Transcript | Out-Null
Read-Host 'Press Enter to close'
