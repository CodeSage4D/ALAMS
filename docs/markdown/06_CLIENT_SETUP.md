# ALAMS Client Workstation Setup Guide

This document covers the configuration and deployment of the workstation security layer for the **ALAMS (Aurxon Lab Access Management System)**.

---

## 1. Prerequisites for Workstations

*   **Operating System**: Windows 10/11 Professional, Enterprise, or Education (64-bit).
*   **Runtime Environment**: Microsoft .NET 8.0 Desktop Runtime.
*   **Network**: Active IPv4 connection to the central ALAMS Server (port 5000).
*   **User Account Config**: Two accounts must exist on the workstation:
    1.  `Administrator`: Full system access, runs normal desktop Explorer.
    2.  `Student`: Restricted account, auto-logs on, runs the ALAMS Lock Screen as shell.

---

## 2. Windows Shell Replacement Integration

To prevent students from bypassing the security screen, ALAMS replaces the default Windows Explorer desktop shell (`explorer.exe`) with the `AlamsClient.exe` executable for the target `Student` account. 

### Registry Configurations (Automated by EnrollShell.ps1)
The shell override is written to the Registry under the following path:
*   **Key Path**: `HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`
*   **Value Name**: `Shell`
*   **Value Type**: `REG_SZ` (String Value)
*   **Value Data**: `C:\Program Files\ALAMS\AlamsClient.exe`

### Shell Override Recovery Backup
The original shell config (usually `explorer.exe`) is saved during registration to `C:\ProgramData\ALAMS\shell_backup.txt`. Uninstalling the client automatically restores the default Registry settings.

---

## 3. Workstation Deployment & Installation

### Option A: Fully Automated Bootstrap Wizard (Recommended)
This method utilizes the C# intelligent Bootstrap Installer. See [BOOTSTRAP_GUIDE.md](BOOTSTRAP_GUIDE.md) for step-by-step instructions.

### Option B: Silent Script Installation (GPO/Active Directory)
Run the silent install batch command as an Administrator:
```batch
.\scripts\install_client.bat "http://[server-ip]:5000"
```
This batch script will:
1.  Verify Administrator privileges.
2.  Create directory structures `C:\Program Files\ALAMS` and `C:\ProgramData\ALAMS`.
3.  Generate the initial `config.json` containing the server URL.
4.  Copy compiled binaries (`AlamsClient.exe` and `AlamsWatchdog.exe`) to Program Files.
5.  Register and start the Windows service `AlamsWatchdog`.
6.  Call `EnrollShell.ps1` to configure the restricted Student account shell.

---

## 4. Operational Watchdog Enforcement

The **AlamsWatchdog** service runs as a background Windows Service (`AlamsWatchdog.exe`).
*   **Task**: Monitor active processes.
*   **Enforcement Rule**: If Windows Explorer (`explorer.exe`) is running but the ALAMS Client UI shell (`AlamsClient.exe`) is NOT active, it identifies a student bypass.
*   **Action**: Report a `CRITICAL` bypass alert to the central server and execute a forceful Windows user logoff (`shutdown.exe /l /f`) within 2 seconds.

To verify watchdog operations, query status using:
```powershell
powershell -File .\scripts\watchdog.service status
```

---

## 5. Offline Resiliency Fallback Mode

If the central server becomes unreachable (e.g. network failure), the client automatically defaults to **Resilient Offline PIN Mode**:
1.  The network status indicator displays **OFFLINE** (Red).
2.  The QR code display shows "Workstation Offline".
3.  The keyboard input fields (Enrollment and PIN passcode) remain active.
4.  Students can log in by entering their cached enrollment number and their local PIN (`123456`).
5.  Access is verified locally against cached records. Once verified, the shell triggers Explorer and runs the Session Widget.
