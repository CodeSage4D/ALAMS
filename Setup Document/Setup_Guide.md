# ALAMS (Aurxon Lab Access Management System) — Comprehensive Setup Guide

This document provides a micro-level, step-by-step setup guide for the **ALAMS (Aurxon Lab Access Management System)**. It details every execution step, possible errors, reasons for failure, exact troubleshooting procedures, and alternative methods for setting up each component.

---

## 🗺️ Workspace Directory Map & Setup File Locations

Before starting, familiarize yourself with the location of all critical setup scripts and configuration files:

| Target Component | Execution Script / Configuration File | File Path |
| :--- | :--- | :--- |
| **Server Installation** | Automated Server Install Script | [install_server.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/install_server.bat) |
| **Server Startup** | Automated Server Launch Script | [start_server.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/start_server.bat) |
| **Server Shutdown** | Automated Server Terminate Script | [stop_server.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/stop_server.bat) |
| **Server Environment** | Template Server Environment Variables | [.env.example](file:///d:/Project%20Data%20Aurxon/ALAMS/config/.env.example) |
| **Database Schema** | Prisma Relational DB Schema | [schema.prisma](file:///d:/Project%20Data%20Aurxon/ALAMS/server/prisma/schema.prisma) |
| **Database Seeding** | Timetable, Student & Admin Seed Data | [seed.ts](file:///d:/Project%20Data%20Aurxon/ALAMS/server/prisma/seed.ts) |
| **Web Console Setup** | Next.js Package Configuration | [package.json](file:///d:/Project%20Data%20Aurxon/ALAMS/web/package.json) |
| **Client Installation** | Silent Client Installer (Workstation) | [install_client.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/install_client.bat) |
| **Client Shell Setup** | Student Shell Registry Override Script | [EnrollShell.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/EnrollShell.ps1) |
| **Client Uninstallation**| Revert Shell Override and Clean Folders | [uninstall_client.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/uninstall_client.bat) |
| **Bootstrap Wizard** | C# Automated Client Registrar (Binary) | `installer/bootstrap_installer.exe` (or source project in [client](file:///d:/Project%20Data%20Aurxon/ALAMS/client)) |
| **Control Console** | Admin Operations CLI Tool | [ControlCenter.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/scripts/ControlCenter.ps1) |

---

## 🛠️ Phase-by-Phase Setup Instructions

```mermaid
graph TD
    A[Phase 1: Setup PostgreSQL Database] --> B[Phase 2: Deploy Central Server API]
    B --> C[Phase 3: Deploy Admin Web Console]
    C --> D[Phase 4: Setup Client Workstations]
    D --> E[Phase 5: Approve Workstations on Web Console]
    E --> F[Phase 6: Lock Student Shell & Test System]
```

---

### 🗄️ Phase 1: Central Database Configuration

The system uses **PostgreSQL** to maintain users, workstations, logs, timetables, and attendance records. By default, it is configured to use **Neon Cloud PostgreSQL**, but you can also use a local installation.

#### Step 1: Create Database Instance
1. Sign up/log in to [Neon Console](https://neon.tech/) or prepare a local PostgreSQL server.
2. Create a new database project named `ALAMS`.
3. Locate the **Database Connection Strings**. You will need two strings:
   - **Pooled URL** (for normal server operations, runs on port 5432/pgbouncer).
   - **Direct URL** (for database migrations and schema pushes, bypasses pgbouncer).

#### Step 2: Prepare Environment Variables
* Environment variable configuration is completed in **Phase 2**, where these URLs are pasted into [server/.env](file:///d:/Project%20Data%20Aurxon/ALAMS/server/.env).

#### ❌ Potential Errors & How to Fix Them

##### Error 1.1: `Error: Can't reach database server at ...` or Connection Timeout
* **Reason**: Neon free tier databases automatically go to sleep after 5–10 minutes of inactivity to save resources. When first queried, they require 3-5 seconds to wake up. Alternatively, a local firewall or corporate proxy might block port 5432.
* **Primary Fix**:
  1. Open the Neon Web Console and check if the project status is active. Send a dummy query in the Neon SQL Editor to wake the database compute node.
  2. Test network connectivity from PowerShell:
     ```powershell
     Test-NetConnection -ComputerName ep-pooler.region.aws.neon.tech -Port 5432
     ```
* **Alternative Method (Local PostgreSQL)**:
  If cloud access is restricted or internet is slow, run a local PostgreSQL instance:
  1. Install PostgreSQL locally on the server machine (or run a Docker container: `docker run --name alams-db -e POSTGRES_PASSWORD=mysecret -p 5432:5432 -d postgres`).
  2. Change your `DATABASE_URL` and `DIRECT_URL` in [server/.env](file:///d:/Project%20Data%20Aurxon/ALAMS/server/.env) to:
     ```env
     DATABASE_URL="postgresql://postgres:mysecret@localhost:5432/alams?schema=public"
     DIRECT_URL="postgresql://postgres:mysecret@localhost:5432/alams?schema=public"
     ```

---

### 🖥️ Phase 2: Express API Central Server Setup

This component manages WebSockets and provides REST endpoints for administrative controls, client heartbeat monitoring, and credentials authorization.

#### 🚀 Option A: Automated Server Setup (Recommended)
1. Open PowerShell as an **Administrator**.
2. Navigate to the project root:
   ```powershell
   cd "d:\Project Data Aurxon\ALAMS"
   ```
3. Run the installation script:
   ```powershell
   .\scripts\install_server.bat
   ```
   *This automated script automatically creates `server/.env` from the config template, executes `npm install`, runs `prisma generate` to compile DB queries, pushes the schema, and seeds default pilot profiles.*

#### 🛠️ Option B: Manual Step-by-Step Setup
If you want granular control or need to debug steps individually:
1. Navigate to the `server/` directory:
   ```powershell
   cd "d:\Project Data Aurxon\ALAMS\server"
   ```
2. Copy the template variables file:
   ```powershell
   copy "..\config\.env.example" ".env"
   ```
3. Edit the `.env` file and replace connection strings with your database URLs:
   - **`DATABASE_URL`** = `postgresql://...`
   - **`DIRECT_URL`** = `postgresql://...`
   - **`JWT_SECRET`** = Configure a custom long secure key (e.g. `MyAlamsJwtSecretKey2026!`).
   - **`QR_SIGNING_KEY`** = Configure a custom long secure key (e.g. `MyAlamsQrSigningKey2026!`).
   - **`WATCHDOG_SECRET`** = Configure a custom secret shared with clients (e.g. `WatchdogServiceSecretToken2026`).
4. Install all server dependencies:
   ```powershell
   npm install
   ```
5. Generate the Prisma Client wrapper code:
   ```powershell
   npx prisma generate
   ```
6. Push schema structure directly to database:
   ```powershell
   npx prisma db push
   ```
7. Seed default system users and database entries:
   ```powershell
   npx ts-node prisma/seed.ts
   ```
8. Start the server:
   - **Production build & run**:
     ```powershell
     ..\scripts\start_server.bat
     ```
   - **Alternative (Development run)**:
     ```powershell
     npm run dev
     ```

#### ❌ Potential Errors & How to Fix Them

##### Error 2.1: `Error: Cannot find module '@prisma/client'`
* **Reason**: The Prisma runtime client was not generated or the build process skipped compilation.
* **Primary Fix**: Manually run `npx prisma generate` in [server/](file:///d:/Project%20Data%20Aurxon/ALAMS/server) directory.
* **Alternative Fix**: Delete `node_modules` and run clean installation sequence:
  ```powershell
  rm -Recurse -Force node_modules, package-lock.json
  npm install
  npx prisma generate
  ```

##### Error 2.2: `Unique constraint failed on the fields: (email)` during Database Seeding
* **Reason**: Seeding scripts were run multiple times without wiping existing records, causing key conflicts.
* **Primary Fix**: Open a DB manager or run the seed clear script:
  - You can run `npx prisma db push --force-reset` to wipe the DB and recreate the schema.
  - Or manually clear tables:
    ```powershell
    npx ts-node prisma/clear-db.ts
    npx ts-node prisma/seed.ts
    ```
* **Alternative Fix**: Run the PostgreSQL query inside Neon Console:
  ```sql
  TRUNCATE users, labs, computers, sessions, attendance CASCADE;
  ```

##### Error 2.3: `Error: listen EADDRINUSE: address already in use :::5000`
* **Reason**: Another process is already running on port 5000 (e.g., an orphaned ALAMS server process, or Windows IIS/AirPlay services).
* **Primary Fix**: Locate the process ID and terminate it:
  ```powershell
  # Find PID on port 5000
  netstat -ano | FindStr ":5000"
  # Terminate PID (replace 1234 with actual PID found)
  taskkill /F /PID 1234
  ```
* **Alternative Fix**: Change server port to another port (e.g., `5001`) in [server/.env](file:///d:/Project%20Data%20Aurxon/ALAMS/server/.env):
  ```env
  PORT=5001
  ```
  *(Note: If you change port to 5001, update client server URLs to match: `http://[server-ip]:5001`)*

##### Alternative Method (PM2 Process Management for Linux/Windows Server)
In a production deployment, rather than running standard terminal scripts which close if the admin logs out, use PM2:
1. Install PM2 globally:
   ```powershell
   npm install -g pm2
   ```
2. Build the project:
   ```powershell
   npm run build
   ```
3. Run the service in background:
   ```powershell
   pm2 start dist/index.js --name "alams-server"
   pm2 save
   ```

---

### 🌐 Phase 3: Web Admin Console / Dashboard Setup

The Next.js web application acts as both the student mobile gateway (for scanning workstation QRs) and the administrative dashboard.

#### Step 1: Open Directory & Install Packages
1. Navigate to the `web/` directory:
   ```powershell
   cd "d:\Project Data Aurxon\ALAMS\web"
   ```
2. Install npm dependencies:
   ```powershell
   npm install
   ```

#### Step 2: Configure Environment Variables
1. Copy the example configuration:
   ```powershell
   copy .env.local.example .env.local
   ```
   *Note: If `.env.local` already exists, open it directly.*
2. Set your environment variables:
   - **`NEXT_PUBLIC_API_URL`**: Must point to the server API URL.
     - **For Local Testing (Loopback)**: `http://localhost:5000`
     - **For Production LAN**: `http://[server-ip]:5000` (e.g., `http://10.0.3.5:5000`)

#### Step 3: Run the Server
* **For Development (Hot Reloading)**:
  ```powershell
  npm run dev
  ```
  *(Dashboard will start on `http://localhost:3000`)*
* **For Production Build & Execution (Recommended)**:
  ```powershell
  npm run build
  # After successful compilation
  npm run start
  ```

#### ❌ Potential Errors & How to Fix Them

##### Error 3.1: Network requests fail (Admin login loads indefinitely / CORS error)
* **Reason**: `NEXT_PUBLIC_API_URL` is pointing to the wrong IP, port, or protocol, or the central server does not allow CORS requests from the dashboard.
* **Primary Fix**:
  1. Open [web/.env.local](file:///d:/Project%20Data%20Aurxon/ALAMS/web/.env.local) and make sure `NEXT_PUBLIC_API_URL` uses the exact IP address and port of your running backend.
  2. Open [server/.env](file:///d:/Project%20Data%20Aurxon/ALAMS/server/.env) and ensure `CORS_ORIGINS` includes the URL of your dashboard (e.g. `http://localhost:3000`). Restart the central server.
* **Alternative Fix**: Inspect network requests in Chrome DevTools (Press F12 -> Network). Check if the API requests are getting blocked or returning a 404/502.

##### Error 3.2: Next.js Port 3000 is occupied
* **Reason**: Another web project is already running on port 3000.
* **Primary Fix**: Modify startup script arguments:
  - Launch dev on a custom port:
    ```powershell
    npx next dev -p 3001
    ```
  - Launch production build on custom port:
    ```powershell
    npx next start -p 3001
    ```

---

### 💻 Phase 4: Client Workstation & Active Directory/GPO Deployments

Workstations run two components:
1. **`AlamsClient.exe`**: C# WPF visual overlay that replaces the student account desktop explorer and presents the dynamic QR login panel.
2. **`AlamsWatchdog.exe`**: Background Windows Service running under the local system account, monitoring student bypasses and initiating immediate forced logoffs if explorer is run without a verified unlock session.

#### 🚀 Option A: Automated Workstation Bootstrap Wizard (Recommended)
This uses the automated wizard binary to gather device specs, perform connections, and deploy resources.
1. Run the C# Bootstrap Wizard on the workstation as an **Administrator**:
   ```powershell
   .\installer\bootstrap_installer.exe
   ```
2. The wizard will automatically query active network configurations. If auto-discovery fails, input the server URL:
   `http://[server-ip]:5000`
3. The wizard connects, submits hardware specs, retrieves workstation UUID, copies application files, and verifies connectivity.

#### 📦 Option B: Silent Command Script Installation (GPO Deployments)
For corporate/educational networks where IT staff deploy to dozens of computers silently:
1. Build the C# projects on the development machine in **Release** or **Debug** configurations.
2. Log in as local administrator on the target workstation.
3. Open an administrative command prompt/PowerShell and run the client installation batch script, providing the central server URL:
   ```powershell
   .\scripts\install_client.bat "http://10.0.3.5:5000"
   ```
   *This silent installer creates local application directories, provisions the `config.json` containing the backend host, copies binary files into Program Files, registers `AlamsWatchdog` as a Windows service, and invokes the shell enrollment script.*

#### ❌ Potential Errors & How to Fix Them

##### Error 4.1: `[ERROR] This installer must be executed as an ADMINISTRATOR.`
* **Reason**: Client configuration requires writing to protected registry keys (`HKEY_CURRENT_USER\Software...`) and creating system service paths inside `C:\Program Files`.
* **Primary Fix**: Close the terminal window. Right-click PowerShell or Command Prompt, select **Run as Administrator**, and execute the installer script again.

##### Error 4.2: Client shows "OFFLINE MODE" on startup
* **Reason**: The client cannot establish a WebSocket connection to the central server.
* **Primary Fix**:
  1. Ping the server from the workstation terminal:
     ```powershell
     ping [server-ip]
     ```
  2. Verify that port 5000 is open in the Central Server's Windows Defender Firewall:
     - Open Windows Defender Firewall with Advanced Security -> **Inbound Rules**.
     - Create a **New Rule**. Select **Port**, protocol **TCP**, port **5000**. Select **Allow the connection**.
  3. Inspect `C:\ProgramData\ALAMS\config.json` on the workstation and verify that `serverUrl` is configured correctly.
* **Alternative Bypass Mode (Offline PIN Logins)**:
  If the network is down and you must log in:
  1. Ensure `offlinePinEnabled` is set to `true` in configurations.
  2. Log in using your cached enrollment code and the default offline PIN: `123456`.
  3. The local client will bypass the network validation, trigger explorer shell launch, and save check-in cache data.

##### Error 4.3: Registry Shell override writes fail or script execution is disabled
* **Reason**: Windows default security policies restrict execution of PowerShell scripts (`EnrollShell.ps1`) without explicit developer bypass.
* **Primary Fix**: Launch script with bypass parameters:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\EnrollShell.ps1
  ```
* **Alternative Fix**: Configure the execution policy for the session first:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  .\EnrollShell.ps1
  ```

---

### 🛡️ Phase 5: Approve Workstations on Web Console

Newly installed workstations submit their details to the central server but remain locked in a **PENDING REGISTRATION** state. They must be approved before they can display active login QR codes.

1. Open the Web Console: `http://[server-ip]:3000`.
2. Log in as an Administrator (e.g., `karan.mishra@suas.ac.in` / `Pilot@2026!`).
3. Navigate to **Asset Inventory** -> **Pending Workstations** (or **Pending Assets**).
4. Locate the newly registered workstation. Match the hostname and hardware serial identifier displayed.
5. Click **Approve**.
6. Assign a target **Lab Zone** (e.g. `SUAS Lab A`) and the workstation **Seat Number** (e.g. `PC-01`).
7. Once approved, the workstation WebSocket connection immediately triggers an update: the lock screen will update from `PENDING` to `ONLINE` status, render the PC seat number, and begin displaying active QR codes.

---

### 🔒 Phase 6: Lock Student Shell & Test System

To secure workstations against standard student bypass attempts, lock the Windows Shell.

#### Step 1: Create Student Windows Account
1. Open Windows settings and create a standard user account on the workstation named **`Student`**.
2. Configure **Autologon** for this `Student` account so the PC boots directly into this user profile.

#### Step 2: Enroll Shell Override
1. Log in to the workstation *as the Student user* (or run shell enrollment impersonating the user).
2. Open PowerShell as Administrator and run the enrollment script to overwrite the registry:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\EnrollShell.ps1
   ```
   *This registry shell override points `HKEY_CURRENT_USER\...\Winlogon\Shell` to `C:\Program Files\ALAMS\AlamsClient.exe` for the student account. Explorer.exe will not load for this user.*

#### Step 3: Run Smoke/Diagnostics Tests
Run the automated system health and configuration validator script:
```powershell
powershell -ExecutionPolicy Bypass -File .\tests\smoke_test.ps1
```

#### Step 4: Revert / Uninstall (Alternative Restorations)
If you need to restore the workstation to a normal state (e.g. for maintenance or if the client lock screen malfunctions):
* **To Restore Explorer manually via Task Manager**:
  1. On the locked workstation, press `Ctrl + Shift + Esc` (or `Ctrl + Alt + Delete`) to open **Windows Task Manager**.
  2. Select **File** -> **Run new task**.
  3. Type `explorer.exe` and select **Create this task with administrative privileges**. Click OK.
  4. The normal Windows desktop will load.
* **To Revert the Shell Override permanently (Uninstall)**:
  1. Open PowerShell as Administrator.
  2. Execute the uninstallation batch script:
     ```powershell
     .\scripts\uninstall_client.bat
     ```
     *This script stops and deletes the `AlamsWatchdog` service, removes HKCU registry overrides, and deletes Program Files/ProgramData folders.*

---

## 🎮 Operations & Database Administration Guide

Admin staff can manage system statuses, query logs, database states, and configuration updates using the **ALAMS Operations Console**.

### Running the Operations Console
Open PowerShell as Administrator and execute:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ControlCenter.ps1
```

```
=====================================================================
                 ALAMS ENTERPRISE CONTROL CENTER                     
=====================================================================
  Server API  : http://localhost:5000
  Dashboard   : http://localhost:3000
  System State: ONLINE (UP)
=====================================================================
```

#### Key Console Operations:
1. **Start ALAMS Server** (Starts the Node/Express backend service in a background process).
2. **Stop ALAMS Server** (Gracefully stops the active server).
3. **Restart ALAMS Server** (Re-initializes connections and pulls build changes).
4. **Backup Database** (Generates SQL snapshot in `backups/`).
5. **Restore Database** (Restores system state from selected SQL backup file).
6. **Check Server Health** (Pings endpoint diagnostics and outputs database configuration stats).

---

## 📝 Quick Troubleshooting Cheat Sheet

| Problem | Potential Cause | Primary Fix | Alternative Method |
| :--- | :--- | :--- | :--- |
| **Server fails to start with module errors** | Missing `@prisma/client` library. | Run `npx prisma generate` inside `server/` directory. | Reinstall node modules: `npm install`. |
| **Computers show offline in Admin Dashboard** | Active WebSocket connection dropped. | Restart the `AlamsClient.exe` process or restart PC. | Verify target server is active via `/health` endpoint. |
| **QR code is missing / blank** | `api.qrserver.com` api endpoint unreachable (no Internet). | Ensure the workstation is connected to the internet. | Update `MainWindow.xaml.cs` to self-host QR generation. |
| **WMI fields return "N/A"** | Application lack system query permissions. | Right-click application and select **Run as Administrator**. | Configure application manifest to request admin level. |
| **Attendance not recorded after unlock** | Current time does not match any scheduled slot. | Check TimetableSlot configuration matches target time. | Seed fresh database configurations matching current time. |
| **Attendance marked ABSENT on checkout** | Session duration is less than 15-minute threshold. | No action required. This prevents student quick unlocks. | Modify validation rule thresholds inside the server logic. |
