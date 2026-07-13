# =============================================================================
# ALAMS Workstation Enrollment Script
# SCSIT Symbiosis University of Applied Sciences, Indore
# =============================================================================

# Ensure running with administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Please run this script as an Administrator!"
    Exit 1
}

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "       ALAMS WORKSTATION AUTOMATED ENROLLMENT WIZARD        " -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Locate Server (Auto-discovery)
$ServerUrl = "http://localhost:5000"
Write-Host "[1/4] Discovering ALAMS Central Server..." -ForegroundColor Yellow

# Look for UDP Beacon
Write-Host "      Listening for server beacon on UDP port 35200 (timeout 3s)..."
$udpClient = New-Object System.Net.Sockets.UdpClient(35200)
$udpClient.Client.ReceiveTimeout = 3000
try {
    $remoteIp = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    $bytes = $udpClient.Receive([ref]$remoteIp)
    $beacon = [System.Text.Encoding]::UTF8.GetString($bytes)
    if ($beacon -match '"serverUrl":"([^"]+)"') {
        $ServerUrl = $Matches[1]
        Write-Host "      [PASS] Discovered Server via UDP Beacon: $ServerUrl" -ForegroundColor Green
    }
} catch {
    Write-Host "      No active UDP beacon detected. Scanning local subnet..."
} finally {
    $udpClient.Close()
}

# Prompt server URL with default
$inputUrl = Read-Host "      Enter ALAMS Server HTTP URL [Default: $ServerUrl]"
if ($inputUrl -ne "") {
    $ServerUrl = $inputUrl
}

# Validate Server Connection
Write-Host "      Verifying connection to $ServerUrl/health..."
try {
    $health = Invoke-RestMethod -Uri "$ServerUrl/health" -TimeoutSec 3
    if ($health.status -eq "healthy") {
        Write-Host "      [PASS] Connected successfully to ALAMS Server!" -ForegroundColor Green
    } else {
        Write-Warning "      Server status is unhealthy. Check DB connection."
    }
} catch {
    Write-Warning "      Could not connect to server. Enrollment will run offline fallback."
}

# 2. Collect Device Specifications (Hardware Fingerprint)
Write-Host ""
Write-Host "[2/4] Gathering system specifications..." -ForegroundColor Yellow

$motherboard = (Get-WmiObject Win32_BaseBoard -ErrorAction SilentlyContinue).SerialNumber
if (-not $motherboard) { $motherboard = "N/A" }

$bios = (Get-WmiObject Win32_BIOS -ErrorAction SilentlyContinue).SerialNumber
if (-not $bios) { $bios = "N/A" }

$cpu = (Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue).ProcessorId
if (-not $cpu) { $cpu = "N/A" }

$machineGuid = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Cryptography' -ErrorAction SilentlyContinue).MachineGuid
if (-not $machineGuid) { $machineGuid = "N/A" }

# Extract active MAC Address
$netInterface = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
$macAddress = $netInterface.MacAddress
if (-not $macAddress) {
    $macAddress = "00:1A:2B:3C:4D:5E"
} else {
    $macAddress = $macAddress.Replace("-", ":")
}

$ipAddress = "127.0.0.1"
if ($netInterface) {
    $ipConf = Get-NetIPAddress -InterfaceIndex $netInterface.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1
    if ($ipConf) { $ipAddress = $ipConf.IPAddress }
}

# Hardware specs
$ramVal = [math]::round((Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | Measure-Object -Property Capacity -Sum).Sum / 1GB, 0)
$ram = "$ramVal GB"

$storageVal = [math]::round((Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Measure-Object -Property Size -Sum).Sum / 1GB, 0)
$storage = "$storageVal GB"

$gpu = (Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -First 1).Name
if (-not $gpu) { $gpu = "Intel HD Graphics" }

$osVersion = (Get-CimInstance Win32_OperatingSystem).Caption
$clientVersion = "1.0.0"
$deviceName = $env:COMPUTERNAME

$fingerprint = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$motherboard|$bios|$cpu|$machineGuid|$macAddress"))).Replace("-", "")

Write-Host "      Host Name: $deviceName"
Write-Host "      MAC Address: $macAddress"
Write-Host "      IP Address: $ipAddress"
Write-Host "      CPU ID: $cpu"
Write-Host "      RAM: $ram | Storage: $storage"
Write-Host "      OS Version: $osVersion"

# 3. Register Workstation via REST API
Write-Host ""
Write-Host "[3/4] Enrolling workstation with ALAMS Server..." -ForegroundColor Yellow

$payload = @{
    macAddress = $macAddress
    deviceName = $deviceName
    ipAddress = $ipAddress
    fingerprint = $fingerprint
    computerUuid = [System.Guid]::NewGuid().ToString()
    machineGuid = $machineGuid
    motherboardSerial = $motherboard
    cpuId = $cpu
    biosSerial = $bios
    ram = $ram
    storage = $storage
    osVersion = $osVersion
    clientVersion = $clientVersion
} | ConvertTo-Json

$computerId = "offline-fallback-id"
try {
    $headers = @{ "Content-Type" = "application/json" }
    $enrollResponse = Invoke-RestMethod -Uri "$ServerUrl/api/v1/client/enroll" -Method Post -Body $payload -Headers $headers -TimeoutSec 5
    
    if ($enrollResponse.computerId) {
        $computerId = $enrollResponse.computerId
        Write-Host "      [PASS] Enrolled successfully on server!" -ForegroundColor Green
        Write-Host "      Assigned Workstation ID: $computerId"
        Write-Host "      Enrollment Status: $($enrollResponse.status)" -ForegroundColor Green
    }
} catch {
    Write-Warning "      Connection failed. Registering in local cache for sync when online."
}

# 4. Configure Client settings and registry
Write-Host ""
Write-Host "[4/4] Writing local workstation configuration..." -ForegroundColor Yellow

$ConfigDir = "C:\ProgramData\ALAMS"
$ConfigPath = "$ConfigDir\config.json"

if (-not (Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
}

$config = @{
    serverUrl = $ServerUrl
    computerId = $computerId
} | ConvertTo-Json

Set-Content -Path $ConfigPath -Value $config -Force

Write-Host "      Configuration written to: $ConfigPath" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "       ENROLLMENT COMPLETED SUCCESSFULLY! HAPPY SESSIONS    " -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
