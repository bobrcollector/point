# Запускается с правами администратора (UAC) из open-lan-firewall.mjs
$port = if ($env:POINT_WEB_PORT) { $env:POINT_WEB_PORT } else { '5173' }
$ruleName = "Point Dev $port"
$existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Правило брандмауэра уже есть: $ruleName"
  exit 0
}
netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port profile=private,domain,public
if ($LASTEXITCODE -ne 0) {
  Write-Error "Не удалось добавить правило брандмауэра для порта $port"
  exit 1
}
Write-Host "Открыт входящий TCP $port (частная, общедоступная и доменная сеть)"
