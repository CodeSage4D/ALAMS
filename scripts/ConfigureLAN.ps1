# =============================================================================
# ALAMS - LAN Auto-Configuration Helper Script
# =============================================================================

Write-Host "=== ALAMS LAN AUTO-CONFIGURATION ===" -ForegroundColor Cyan

# 1. Automatically detect LAN IP address
Write-Host "Detecting LAN IP address..." -ForegroundColor Gray

# Find active adapters with a default gateway first
$ipConfig = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway }
$ipAddress = ($ipConfig | Select-Object -ExpandProperty IPv4Address | Select-Object -First 1).IPAddress

if (-not $ipAddress) {
    # Fallback: get any non-loopback IPv4 address
    $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
}

if (-not $ipAddress) {
    Write-Host "[ERROR] Could not automatically detect a valid local IP address." -ForegroundColor Red
    Write-Host "Please connect your server to the local network (LAN) and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Detected Server LAN IP: $ipAddress" -ForegroundColor Green

# 2. Define File Paths relative to the script location
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverEnvPath = Join-Path $scriptPath "..\server\.env"
$webEnvPath = Join-Path $scriptPath "..\web\.env.local"

# 3. Update server/.env
if (Test-Path $serverEnvPath) {
    Write-Host "Updating server/.env..." -ForegroundColor Gray
    $content = Get-Content $serverEnvPath -Raw
    
    # Locate CORS_ORIGINS
    if ($content -match 'CORS_ORIGINS="([^"]+)"') {
        $existingOrigins = $Matches[1]
        
        # Check if our detected IP origin is already there
        $newOrigin = "http://${ipAddress}:3000"
        if ($existingOrigins -notlike "*$newOrigin*") {
            $updatedOrigins = "$existingOrigins,$newOrigin"
            $content = $content -replace 'CORS_ORIGINS="[^"]+"', "CORS_ORIGINS=`"$updatedOrigins`""
            Set-Content -Path $serverEnvPath -Value $content -NoNewline
            Write-Host "[OK] Added $newOrigin to CORS_ORIGINS in server/.env" -ForegroundColor Green
        } else {
            Write-Host "[OK] CORS_ORIGINS already contains $newOrigin" -ForegroundColor Green
        }
    } else {
        # If CORS_ORIGINS doesn't exist, append it
        Add-Content -Path $serverEnvPath -Value "`nCORS_ORIGINS=`"http://localhost:3000,http://localhost:5000,http://${ipAddress}:3000`""
        Write-Host "[OK] Appended CORS_ORIGINS to server/.env" -ForegroundColor Green
    }
} else {
    Write-Host "[WARN] server/.env not found at $serverEnvPath" -ForegroundColor Yellow
}

# 4. Update web/.env.local
if (Test-Path $webEnvPath) {
    Write-Host "Updating web/.env.local..." -ForegroundColor Gray
    $newApiUrl = "NEXT_PUBLIC_API_URL=`"http://${ipAddress}:5000`""
    Set-Content -Path $webEnvPath -Value $newApiUrl
    Write-Host "[OK] Set NEXT_PUBLIC_API_URL to http://${ipAddress}:5000 in web/.env.local" -ForegroundColor Green
} else {
    # If file doesn't exist, create it
    $newApiUrl = "NEXT_PUBLIC_API_URL=`"http://${ipAddress}:5000`""
    Set-Content -Path $webEnvPath -Value $newApiUrl
    Write-Host "[OK] Created web/.env.local and set API URL." -ForegroundColor Green
}

# 5. Output ready-to-use client installation command
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "LAN CONFIGURATION SUCCESSFUL!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Use the following command on your client workstations:" -ForegroundColor White
Write-Host ".\scripts\install_client.bat `"http://${ipAddress}:5000`"" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
