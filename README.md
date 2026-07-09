# 🔒 ALAMS (Aurxon Lab Access Management System)

ALAMS is a security-focused, dual-factor authentication and session management platform designed for educational computer laboratories. It replaces the default Windows desktop shell for students with a secure lock screen, validating user identity and physical workstation binding before spawning the standard desktop shell.

This document describes the deployment guide for a **6-System Pilot Run** consisting of:
*   **1 Central Server**: Hosts the Node.js Express API, WebSocket handler, and Next.js Web Console.
*   **5 Client Workstations** (designated as `PC-A01` through `PC-A05`): Restricts student access, displays dynamic QR codes, and runs an anti-bypass background Windows service.

---

## 🗺️ Project Workspace & Setup Reference

Here are the locations of all critical setup scripts, code folders, and configuration templates:

| Component | Target File / Folder | File Path |
| :--- | :--- | :--- |
| **Server Install** | Automated Central Server Installer | [install_server.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/install_server.bat) |
| **Server Startup** | Automated Backend Service Launch | [start_server.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/start_server.bat) |
| **Server Stop** | Automated Backend Service Stop | [stop_server.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/stop_server.bat) |
| **Server Env** | Database & Signing Keys Configuration | [.env.example](file:///d:/Project%20Data%20Aurxon/ALAMS/config/.env.example) |
| **Web Console** | Admin Dashboard & Mobile Gateway | [web/](file:///d:/Project%20Data%20Aurxon/ALAMS/web) |
| **Client Install** | Workstation Installer Script | [install_client.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/install_client.bat) |
| **Shell Lock** | PowerShell Shell Registry Restrictor | [EnrollShell.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/EnrollShell.ps1) |
| **Uninstall Client**| Revert Windows Shell & Remove Watchdog | [uninstall_client.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/uninstall_client.bat) |
| **C# Source** | Visual Studio WPF and Watchdog Projects | [client/](file:///d:/Project%20Data%20Aurxon/ALAMS/client) / [watchdog/](file:///d:/Project%20Data%20Aurxon/ALAMS/watchdog) |
| **Admin Panel** | Windows PowerShell Administrative CLI | [ControlCenter.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/ControlCenter.ps1) |

---

## 📦 Pilot Architecture (6-System Setup)

```
                            +-------------------------+
                            |  PostgreSQL Database    |
                            |  (Neon Cloud / Local)   |
                            +------------+------------+
                                         ^
                                         | (Prisma ORM over TLS 1.3)
                                         v
                            +------------+------------+
                            |  Central Server Machine  |
                            |  - Express API (:5000)   |
                            |  - Next.js Web (:3000)   |
                            +------------+------------+
                                         ^
                                         | (LAN WebSockets / REST)
          +------------------------------+------------------------------+
          |                              |                              |
+---------+---------+          +---------+---------+          +---------+---------+
|  Workstation 01   |          |  Workstation 02   |          |  Workstation 05   |
|  - WPF Client     |   ...    |  - WPF Client     |   ...    |  - WPF Client     |
|  - Watchdog Svc   |          |  - Watchdog Svc   |          |  - Watchdog Svc   |
|  (PC-A01)         |          |  (PC-A02)         |          |  (PC-A05)         |
+-------------------+          +-------------------+          +-------------------+
```

---

## 🛠️ Step-by-Step Pilot Setup Guide

### 🗄️ Part 1: Central Database Provisioning
The system requires a PostgreSQL database to manage users, configurations, sessions, and security audits.

1.  Sign up or log in to the [Neon Console](https://neon.tech/) and create a new project named `alams-pilot`.
2.  Retrieve your connection strings from the database dashboard. You will need:
    *   **Pooled URL**: Used for server operations (port 5432 with `pgbouncer=true`).
    *   **Direct URL**: Used for schema migrations (bypasses PgBouncer).

---

### 🖥️ Part 2: Deploying the Central Server Machine
Perform these steps on the server machine:

#### Step 2.1: Verify Software Prerequisites
Ensure you have the following installed:
*   **Node.js (v20 LTS)** and **npm**: Verify via `node -v` and `npm -v`.
*   **Git**: Verify via `git --version`.

#### Step 2.2: Set Up Environment Variables
1.  Copy the environment variables template:
    ```powershell
    copy "d:\Project Data Aurxon\ALAMS\config\.env.example" "d:\Project Data Aurxon\ALAMS\server\.env"
    ```
2.  Open [server/.env](file:///d:/Project%20Data%20Aurxon/ALAMS/server/.env) and populate the values:
    ```env
    DATABASE_URL="postgresql://alams_admin:YOUR_PASSWORD@ep-pooler.region.aws.neon.tech/alams?sslmode=require&pgbouncer=true"
    DIRECT_URL="postgresql://alams_admin:YOUR_PASSWORD@ep-direct.region.aws.neon.tech/alams?sslmode=require"
    PORT=5000
    JWT_SECRET="MyAlamsJwtSecretKey2026!6SystemPilot"
    QR_SIGNING_KEY="MyAlamsQrSigningKey2026!6SystemPilot"
    WATCHDOG_SECRET="WatchdogServiceSecretToken2026"
    ```

#### Step 2.3: Build & Seed the Server
1.  Open PowerShell as **Administrator** and run the automated server install script:
    ```powershell
    cd "d:\Project Data Aurxon\ALAMS"
    .\scripts\install_server.bat
    ```
    *This runs `npm install`, generates the Prisma Client wrapper, pushes the database schema, and seeds default pilot user accounts.*
2.  Start the Express API server:
    ```powershell
    .\scripts\start_server.bat
    ```
3.  Verify server connectivity by requesting the health check endpoint in a browser or terminal:
    ```powershell
    curl http://localhost:5000/health
    # Expected: {"status":"healthy","timestamp":...}
    ```

---

### 🌐 Part 3: Deploying the Admin Web Console & Mobile Gateway
On the same server machine (or another system running on the LAN):

1.  Navigate to the web folder and install dependencies:
    ```powershell
    cd "d:\Project Data Aurxon\ALAMS\web"
    npm install
    ```
2.  Create `.env.local` to point to the server's API:
    ```powershell
    copy .env.local.example .env.local
    ```
3.  Open [web/.env.local](file:///d:/Project%20Data%20Aurxon/ALAMS/web/.env.local) and verify the API URL matches your central server LAN IP (e.g. `192.168.128.73` or `localhost` if local):
    ```env
    NEXT_PUBLIC_API_URL="http://192.168.128.73:5000"
    ```
4.  Compile and start the Next.js production server:
    ```powershell
    npm run build
    npm run start
    ```
    *The Web Console is now running on port 3000. Access it at `http://[server-ip]:3000`.*

---

### 💻 Part 4: Deploying the 5 Client Workstations
Execute these steps on each of the **5 pilot workstations** (`PC-A01` to `PC-A05`):

#### Step 4.1: Build Client and Watchdog Executables (On Dev Machine)
Before heading to the workstations, build the binaries on your personal PC:
1.  Publish the C# WPF Client:
    ```powershell
    cd "d:\Project Data Aurxon\ALAMS\client"
    dotnet publish AlamsClient.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ".\publish\client"
    ```
2.  Publish the C# Windows Watchdog Service:
    ```powershell
    cd "d:\Project Data Aurxon\ALAMS\watchdog"
    dotnet publish AlamsWatchdog.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ".\publish\watchdog"
    ```

#### Step 4.2: Install on Target Workstations
1.  Copy the compiled folders (`.\publish\client` and `.\publish\watchdog`) and the installer scripts to the workstation (via USB drive or network share).
2.  Open PowerShell as **Administrator** on the workstation.
3.  Execute the installation script, specifying the Server API IP:
    ```powershell
    # Replace 192.168.128.73 with your actual server machine IP
    .\scripts\install_client.bat "http://192.168.128.73:5000"
    ```
    *This creates directories inside Program Files and ProgramData, registers the background watchdog service, and executes the user registry shell hook.*

#### Step 4.3: Approve Workstation on Admin Console
1.  Upon installation, the client displays a **PENDING REGISTRATION** screen showing a unique hardware fingerprint.
2.  Open your browser and navigate to the Admin Dashboard: `http://[server-ip]:3000`.
3.  Log in with default admin credentials:
    *   **Username**: `ADMIN01` (or `karan.mishra@suas.ac.in`)
    *   **Password**: `Pilot@2026!` (as defined in database seed configuration)
4.  Navigate to **Asset Inventory** -> **Pending Workstations**.
5.  Match the fingerprint, select the workstation card, and choose **Approve**.
6.  Assign the PC number (`PC-A01`, `PC-A02`, etc.) and Lab Zone.
7.  The workstation lock screen will immediately transition to **ONLINE** status and display the login interface.

#### Step 4.4: Create Student Account & Lock Windows Shell
1.  On the workstation, create a local standard user account named **`Student`**.
2.  Optionally, configure Windows to **Autologon** directly into the `Student` account on boot.
3.  Log in as the **`Student`** user.
4.  Run [EnrollShell.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/EnrollShell.ps1) once within the Student profile to lock out standard Windows Explorer:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\EnrollShell.ps1
    ```
5.  Log out and log back in. The workstation is now locked by ALAMS and ready for student login checks.

---

## 🎮 Operations Guide

### Initializing Git Repository
To push this code workspace to your remote repository, execute the following commands:
```powershell
cd "d:\Project Data Aurxon\ALAMS"

# Initialize local git repository
git init

# Add all files to staging
git add .

# Commit files
git commit -m "Initial commit of ALAMS - 6 System Pilot Configuration"

# Set default main branch
git branch -M main

# Link remote origin
git remote add origin git@github.com:CodeSage4D/ALAMS.git

# Push changes to GitHub
git push -u origin main
```

### Control Center Operations
Administrative staff can manage server functions via the command line. Run as administrator:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ControlCenter.ps1
```
Use this CLI tool to restart the API server, execute database backups, restore database snapshots, or check the server status.

---

## 📝 Troubleshooting Summary

*   **Client displays OFFLINE**:
    *   Ensure the workstation can ping the server's LAN IP address.
    *   Ensure Windows Defender Firewall on the central server permits inbound traffic on **port 5000** (API) and **port 3000** (Next.js dashboard).
*   **Database connection fails**:
    *   Verify your internet connection (since Neon is a cloud-based PostgreSQL database).
    *   Check your database connections using `Test-NetConnection -ComputerName ep-pooler.region.aws.neon.tech -Port 5432`.
*   **Reverting Shell / Uninstalling**:
    *   If you need to log in as administrator to perform workstation updates, press `Ctrl+Shift+Esc` to open Task Manager, select **File -> Run New Task**, and execute `explorer.exe` with administrative rights.
    *   To remove ALAMS permanently from a workstation, run:
        ```powershell
        .\scripts\uninstall_client.bat
        ```
