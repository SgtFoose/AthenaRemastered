$backend = "http://127.0.0.1:5000"

function Post-Put($fn, $putArgs) {
    $body = [ordered]@{ fn = $fn; args = $putArgs } | ConvertTo-Json -Compress
    try {
        $r = Invoke-WebRequest -Uri "$backend/api/game/put" -Method POST `
             -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 3
        return $r.StatusCode
    } catch { return $_.Exception.Response.StatusCode.value__ }
}

function Get-State() {
    return (Invoke-WebRequest -Uri "$backend/api/game/state" -UseBasicParsing -TimeoutSec 3).Content | ConvertFrom-Json
}

Write-Host "`n=== AthenaServer Backend Tests ===" -ForegroundColor Cyan

Write-Host "`n[1] Backend alive..." -ForegroundColor Yellow
$state = Get-State
Write-Host "  OK - current mission: '$($state.mission.name)'" -ForegroundColor Green

Write-Host "`n[2] OLD DLL (quoted fn name - backend should ignore it)..." -ForegroundColor Yellow
Post-Put '"mission"' @('"QUOTED_BUG"', '"Author"', '"VR"', '"desc"', 'false', '"Player1"', '99') | Out-Null
$state2 = Get-State
if ($state2.mission.name -eq "QUOTED_BUG") {
    Write-Host "  UNEXPECTED: backend accepted quoted fn name" -ForegroundColor Magenta
} else {
    Write-Host "  CONFIRMED: quoted fn ignored, mission='$($state2.mission.name)'" -ForegroundColor Green
}

Write-Host "`n[3] NEW DLL (clean fn name - should update state)..." -ForegroundColor Yellow
Post-Put 'mission' @('CLEAN_FIXED', 'Author', 'VR', 'description', 'false', 'Player1', '99') | Out-Null
$state3 = Get-State
if ($state3.mission.name -eq "CLEAN_FIXED") {
    Write-Host "  OK - mission updated to '$($state3.mission.name)'" -ForegroundColor Green
} else {
    Write-Host "  FAIL - state not updated: '$($state3.mission.name)'" -ForegroundColor Red
}

Write-Host "`n[4] updateunit (was in warning log)..." -ForegroundColor Yellow
Post-Put 'group' @('g1', '1-1-A', 'WEST', '0', '0') | Out-Null
Post-Put 'unit'  @('u1', 'g1', 'Player1', 'Man', 'WEST', 'ALIVE', 'rifleman', 'Soldier', '', '', '', '', '', 'false', '', '', '') | Out-Null
Post-Put 'updateunit' @('u1', 'g1', '', '100.5', '200.3', '15.0', '90.0', '5.2') | Out-Null
$state4 = Get-State
if ($state4.units.u1) {
    Write-Host "  OK - unit u1 pos=($($state4.units.u1.posX), $($state4.units.u1.posY))" -ForegroundColor Green
} else {
    Write-Host "  FAIL - unit not in state" -ForegroundColor Red
}

Write-Host "`n[5] time..." -ForegroundColor Yellow
Post-Put 'time' @('2035', '6', '15', '14', '30') | Out-Null
$state5 = Get-State
if ($null -ne $state5.time) {
    Write-Host "  OK - time=$($state5.time | ConvertTo-Json -Compress)" -ForegroundColor Green
} else {
    Write-Host "  FAIL - time still null" -ForegroundColor Red
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan