# ALAMS (Aurxon Lab Access Management System)

ALAMS is a security-focused, dual-factor authentication and session management platform designed for educational computer laboratories. It replaces the default Windows desktop shell for students with a secure lock screen, validating user identity and physical workstation binding before spawning the standard desktop shell.

This document describes the deployment guide for a **6-System Pilot Run** consisting of:
*   **Central Server**: Hosts the Node.js Express API, WebSocket handler, and Web Console.
*   **5 Client Workstations** (designated as `PC-A01` through `PC-A05`): Restricts student access, displays dynamic QR codes, and runs an anti-bypass background Windows service.

---

## Workspace Setup Reference

Here are the locations of all critical setup scripts, code folders, and configuration templates:

| Component | Target File / Folder | File Path |
| :--- | :--- | :--- |
| **All-in-One Runner**| Master Launch Wizard Script | [START_ALAMS_PLATFORM.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/START_ALAMS_PLATFORM.bat) |
| **Database Setup** | Automated Local Offline Database Setup | [setup_offline_db.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/setup_offline_db.bat) |
| **Startup Config** | Registry and GUI Startup Setup | [configure_server_startup.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/configure_server_startup.bat) |
| **Server Startup** | Automated Backend Service Launch | [serverstart.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/serverstart.bat) |
| **Server Env** | Database & Signing Keys Configuration | [.env.example](file:///d:/Project%20Data%20Aurxon/ALAMS/config/.env.example) |
| **Client Install** | Workstation Installer Script | [install_client.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/install_client.bat) |
| **Shell Lock** | PowerShell Shell Registry Restrictor | [EnrollShell.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/EnrollShell.ps1) |
| **Uninstall Client**| Revert Windows Shell & Remove Watchdog | [uninstall_client.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/uninstall_client.bat) |
| **C# Source** | Visual Studio WPF and Watchdog Projects | [client/](file:///d:/Project%20Data%20Aurxon/ALAMS/client) / [watchdog/](file:///d:/Project%20Data%20Aurxon/ALAMS/watchdog) |
| **Admin Panel** | Windows PowerShell Administrative CLI | [ControlCenter.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/ControlCenter.ps1) |

---

## Centralized Administrative Launcher

ALAMS includes a master setup and start launcher at the root directory: **[START_ALAMS_PLATFORM.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/START_ALAMS_PLATFORM.bat)**.

Run this script as an **Administrator** to sequentially setup and launch the services:
1. **Option 1**: Prepares and migrates your local offline database.
2. **Option 2**: Compiles administrative WPF dashboards and configures automatic startup registry commands.
3. **Option 3**: Launches the background REST API & WebSocket servers.

---

## Step-by-Step Pilot Setup Guide

### Part 1: Central Database Provisioning
ALAMS central server defaults to running on a local offline PostgreSQL instance (port 5432).

1. Ensure PostgreSQL is installed on your Central Server machine.
2. Open `START_ALAMS_PLATFORM.bat` as an Administrator.
3. Choose **Option 1** (`STEP 1: Run Database Setup & Migration`).
   - This creates the `alams_offline` database, pushes the schema, and seeds default profiles and user credentials.

---

### Part 2: Deploying the Central Server Machine
Perform these steps on the central server machine:

1. Ensure Node.js (v20 LTS or later) is installed.
2. Run `START_ALAMS_PLATFORM.bat` as an Administrator.
3. Choose **Option 2** (`STEP 2: Configure Server Startup & GUI`).
   - This builds the admin desktop interface and registers services to automatically boot when the server turns on.
4. Choose **Option 3** (`STEP 3: Start Central API Backend Server`) to launch the Express API server process.
5. Verify server connectivity by choosing **Option 4** (`Verify Server Health & Diagnostics Checks`).

---

### Part 3: Deploying the 5 Client Workstations
Execute these steps on each of the **5 pilot workstations** (`PC-A01` to `PC-A05`):

#### Step 3.1: Build Client and Watchdog Executables (On Dev Machine)
Before heading to the workstations, compile the binaries on your personal PC:
1. Open PowerShell as an Administrator.
2. Publish the C# WPF Client:
   ```powershell
   cd "d:\Project Data Aurxon\ALAMS\client"
   dotnet publish AlamsClient.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ".\publish\client"
   ```
3. Publish the C# Windows Watchdog Service:
   ```powershell
   cd "d:\Project Data Aurxon\ALAMS\watchdog"
   dotnet publish AlamsWatchdog.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ".\publish\watchdog"
   ```

#### Step 3.2: Install on Target Workstations
1. Copy the compiled folders (`.\publish\client` and `.\publish\watchdog`) and the installer scripts to the workstation.
2. Open PowerShell as **Administrator** on the workstation.
3. Execute the installation script, specifying the Server API IP:
   ```powershell
   # Replace 192.168.128.73 with your actual server machine IP
   .\scripts\install_client.bat "http://192.168.128.73:5000"
   ```

#### Step 3.3: Approve Workstation on Admin Console
1. Log in to the Admin Dashboard (available via Web GUI Console).
2. Go to **Asset Inventory** -> **Pending Workstations**.
3. Match the hardware fingerprint, click **Approve**, and assign the PC number and Lab Zone.

#### Step 3.4: Lock Windows Shell for Students
1. Create a local standard Windows user account named **`Student`**.
2. Run [EnrollShell.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/EnrollShell.ps1) once within the Student profile to lock out standard Windows Explorer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\EnrollShell.ps1
   ```
3. Log out and log back in. The workstation will immediately boot directly into the secure ALAMS Lock Screen.

---

## Troubleshooting Summary

*   **Client displays OFFLINE**:
    - Ensure the workstation can ping the server's LAN IP address (`192.168.128.73`).
    - Ensure Windows Defender Firewall on the central server permits inbound traffic on **port 5000** (API) and **port 3000** (Web).
*   **Reverting Shell / Uninstalling**:
    - If you need to log in as administrator to perform workstation updates, press `Ctrl+Shift+Esc` to open Task Manager, select **File -> Run New Task**, and execute `explorer.exe` with administrative rights.
    - To remove ALAMS permanently from a workstation, run:
      ```powershell
      .\scripts\uninstall_client.bat
      ```
