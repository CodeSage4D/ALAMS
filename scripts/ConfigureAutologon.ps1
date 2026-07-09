param(
    [string]$Username = "Student",
    [string]$Password = "",
    [string]$Domain = "."
)

# Enforce admin privilege check
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be executed as an ADMINISTRATOR."
    Exit 1
}

$RegistryPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

Write-Host "[ALAMS AUTOLOGON] Configuring automatic logon for user: $Username..." -ForegroundColor Cyan

try {
    # Set default credentials and enable auto-logon
    Set-ItemProperty -Path $RegistryPath -Name "DefaultUserName" -Value $Username -Force
    Set-ItemProperty -Path $RegistryPath -Name "DefaultDomainName" -Value $Domain -Force
    Set-ItemProperty -Path $RegistryPath -Name "AutoAdminLogon" -Value "1" -Force
    Set-ItemProperty -Path $RegistryPath -Name "ForceAutoLogon" -Value "1" -Force
    
    if (-not [string]::IsNullOrEmpty($Password)) {
        Set-ItemProperty -Path $RegistryPath -Name "DefaultPassword" -Value $Password -Force
    } else {
        # Prompt for password if not provided
        $secPass = Read-Host -AsSecureString "Enter password for $Username"
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass)
        $PlainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        Set-ItemProperty -Path $RegistryPath -Name "DefaultPassword" -Value $PlainPassword -Force
    }
    
    Write-Host "[OK] Autologon successfully configured. On next boot, Windows will log directly into '$Username'." -ForegroundColor Green
} catch {
    Write-Error "Failed to write autologon registry values: $_"
    Exit 1
}
