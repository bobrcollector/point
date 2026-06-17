#Requires -RunAsAdministrator
# Reset stuck docker-desktop WSL. Run: npm run reset:docker-wsl

$ErrorActionPreference = 'Continue'
$logPath = Join-Path $PSScriptRoot '.reset-docker-wsl.log'
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

function Unregister-WslDistro {
    param([string]$Name)
    Write-Host "  unregister $Name..."
    $proc = Start-Process wsl.exe -ArgumentList '--unregister', $Name -PassThru -NoNewWindow -Wait
    Write-Host "    exit code: $($proc.ExitCode)"
}

Write-Host '=== Reset docker-desktop WSL ===' -ForegroundColor Cyan
Write-Host "Log: $logPath"

Write-Host "`n[1/8] Stop Docker..."
Get-Process | Where-Object { $_.ProcessName -match 'docker|Docker|com\.docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-Service com.docker.service -Force -ErrorAction SilentlyContinue

Write-Host "`n[2/8] Kill stuck WSL..."
Get-Process wsl, wslrelay, vmmemWSL, vmwp -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "`n[3/8] WSL shutdown..."
Stop-WslCommand -Arguments @('--shutdown') -TimeoutSec 20 -Label 'wsl --shutdown' | Out-Null
Start-Sleep -Seconds 2

Write-Host "`n[4/8] Unregister Docker WSL distros..."
Unregister-WslDistro -Name 'docker-desktop'
Unregister-WslDistro -Name 'docker-desktop-data'

Write-Host "`n[5/8] Restart WSL Service..."
net stop WSLService /y 2>&1 | Out-Null
Start-Sleep -Seconds 2
net start WSLService 2>&1
Start-Sleep -Seconds 3

Write-Host "`n[6/8] Verify WSL..."
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
    Write-Host "`nWSL still not responding. Reboot PC, then run this script again before opening Docker." -ForegroundColor Red
    Stop-Transcript | Out-Null
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host "`n[7/8] Start Docker Desktop..."
$docker = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (Test-Path $docker) {
    Start-Process $docker
    Write-Host '  Docker Desktop started. Wait 2-3 min, then run: docker ps' -ForegroundColor Green
}
else {
    Write-Host "  Docker Desktop not found: $docker" -ForegroundColor Red
}

Write-Host "`n[8/8] If Docker still loads forever:"
Write-Host '  Docker Desktop -> Settings (gear) -> Troubleshoot -> Reset to factory defaults' -ForegroundColor Yellow

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host "Log: $logPath"
Stop-Transcript | Out-Null
Read-Host 'Press Enter to close'
