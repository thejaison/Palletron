# Palletron Robot API Test Script
# Usage: .\test_robots.ps1 -Server "http://localhost:8080"

param(
    [string]$Server = "http://localhost:8080"
)

Write-Host "`n=== Checking Connected Robots ===" -ForegroundColor Cyan
try {
    $robots = Invoke-RestMethod -Uri "$Server/api/robots" -Method Get
    Write-Host "Connected Robots: $($robots -join ', ')" -ForegroundColor Green
} catch {
    Write-Host "Failed to connect to backend server at $Server. Is Spring Boot running?" -ForegroundColor Red
    exit
}

if ($robots.Count -eq 0) {
    Write-Host "No ESP32 robots currently connected. Power on Robot 1 and Robot 2 and check serial logs." -ForegroundColor Yellow
    exit
}

foreach ($r in $robots) {
    Write-Host "`n--- Testing Robot: $r ---" -ForegroundColor Cyan
    
    # 1. Check status
    $status = Invoke-RestMethod -Uri "$Server/api/robots/$r/status" -Method Get
    Write-Host "[$r] Current Status: $(ConvertTo-Json $status -Compress)" -ForegroundColor Gray

    # 2. Configure Speed
    Write-Host "[$r] Sending config (speed=25, accel=25, decel=25)..."
    Invoke-RestMethod -Uri "$Server/api/robots/$r/config" -Method Post -ContentType "application/json" -Body '{"speed":25.0,"acceleration":25.0,"deceleration":25.0}' | Out-Null
    Start-Sleep -Milliseconds 500

    # 3. Test short forward move (15cm)
    Write-Host "[$r] Testing Forward 15 cm..." -ForegroundColor Green
    Invoke-RestMethod -Uri "$Server/api/robots/$r/forward" -Method Post -ContentType "application/json" -Body '{"distance":15.0}' | Out-Null
    Start-Sleep -Seconds 2

    # 4. Test Pivot Left (90 deg)
    Write-Host "[$r] Testing Turn Left 90 deg..." -ForegroundColor Green
    Invoke-RestMethod -Uri "$Server/api/robots/$r/left" -Method Post -ContentType "application/json" -Body '{"angle":90.0}' | Out-Null
    Start-Sleep -Seconds 2

    # 5. Test Pivot Right (90 deg)
    Write-Host "[$r] Testing Turn Right 90 deg..." -ForegroundColor Green
    Invoke-RestMethod -Uri "$Server/api/robots/$r/right" -Method Post -ContentType "application/json" -Body '{"angle":90.0}' | Out-Null
    Start-Sleep -Seconds 2

    # 6. Stop
    Write-Host "[$r] Testing Stop..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri "$Server/api/robots/$r/stop" -Method Post | Out-Null
}

Write-Host "`n=== Hardware Verification Complete! ===" -ForegroundColor Green
