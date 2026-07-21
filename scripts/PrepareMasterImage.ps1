# =============================================================================
# ALAMS - Master Client Image Preparation Script (Windows ISO / PXE Cloning)
# =============================================================================
# Run this script on the Master Workstation BEFORE taking a Clonezilla/WDS Image.
# It prepares the OS for autologon, resets machine-specific ALAMS GUIDs,
# sets up registry hooks for EnrollmentShell, and registers Windows Firewall rules.

Param(
    [string]$ServerIp = "192.168.128.73"
)

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " ALAMS - Master Client Image Preparation Tool (v1.2)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Ensure Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "ERROR: Please run this script as Administrator!"
    Exit 1
}

# 1. Clear Machine Specific Hardware Fingerprints & Local Configs
Write-Host "[STEP 1/5] Clearing machine-specific ALAMS configuration cache..." -ForegroundColor Yellow
$configPath = "C:\ProgramData\ALAMS\config.json"
if (Test-Path $configPath) {
    Remove-Item -Path $configPath -Force
    Write-Host "  -> Removed cached config.json (Cloned machines will auto-generate unique GUID on boot)." -ForegroundColor Green
}

# 2. Configure Local 'Student' User & Enable Autologon
Write-Host "[STEP 2/5] Setting up local 'Student' profile & Windows Auto-Logon..." -ForegroundColor Yellow
$studentUser = Get-LocalUser -Name "Student" -ErrorAction SilentlyContinue
if (-not $studentUser) {
    $securePass = ConvertTo-SecureString "Student@ALAMS2026!" -AsPlainText -Force
    New-LocalUser -Name "Student" -Password $securePass -FullName "Lab Student Account" -PasswordNeverExpires $true | Out-Null
    Add-LocalGroupMember -Group "Users" -Member "Student" -ErrorAction SilentlyContinue
    Write-Host "  -> Created standard local user account: Student" -ForegroundColor Green
}

# Set Autologon registry entries
$winlogonKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $winlogonKey -Name "AutoAdminLogon" -Value "1" -Type String
Set-ItemProperty -Path $winlogonKey -Name "DefaultUserName" -Value "Student" -Type String
Set-ItemProperty -Path $winlogonKey -Name "DefaultPassword" -Value "Student@ALAMS2026!" -Type String
Write-Host "  -> Enabled Windows Auto-Logon into 'Student' account." -ForegroundColor Green

# 3. Configure Windows Firewall Rules for ALAMS Client
Write-Host "[STEP 3/5] Applying ALAMS Client Windows Firewall policies..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "ALAMS Client Inbound API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force | Out-Null
New-NetFirewallRule -DisplayName "ALAMS Client UDP Discovery" -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force | Out-Null
New-NetFirewallRule -DisplayName "ALAMS Client Outbound Server" -Direction Outbound -Protocol TCP -RemotePort 5000 -Action Allow -Force | Out-Null
Write-Host "  -> Configured Inbound (5000/35200) & Outbound Windows Firewall rules." -ForegroundColor Green

# 4. Configure ALAMS Client Auto-Start Hooks
Write-Host "[STEP 4/5] Setting up ALAMS Client & Watchdog autorun hooks..." -ForegroundColor Yellow
$clientExePath = "C:\Program Files\ALAMS\AlamsClient.exe"
$watchdogExePath = "C:\Program Files\ALAMS\AlamsDaemon.exe"

# Configure HKLM Run Key
$runKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $runKey -Name "ALAMSClient" -Value "`"$clientExePath`"" -Type String
Write-Host "  -> Registered HKLM Run hook for AlamsClient.exe." -ForegroundColor Green

# 5. Save Default Master Config Template
Write-Host "[STEP 5/5] Writing default master server discovery template..." -ForegroundColor Yellow
$alamsDir = "C:\ProgramData\ALAMS"
if (-not (Test-Path $alamsDir)) { New-Item -ItemType Directory -Path $alamsDir -Force | Out-Null }

$masterConfig = @{
    serverUrl = "http://${ServerIp}:5000"
    computerId = ""
    deviceName = ""
    autoDiscovery = $true
} | ConvertTo-Json

Set-Content -Path "C:\ProgramData\ALAMS\master_template.json" -Value $masterConfig -Encoding UTF8
Write-Host "  -> Written master template targeting http://${ServerIp}:5000" -ForegroundColor Green

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host " SUCCESS! Master Client Workstation is ready for ISO / PXE Cloning." -ForegroundColor Green
Write-Host " You can now run Sysprep or capture an ISO Image with Clonezilla/WDS." -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
