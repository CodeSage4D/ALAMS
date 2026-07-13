# ALAMS Production Deployment Guide

This guide describes the complete workflow to deploy and test the **ALAMS (Aurxon Lab Access Management System)** in a production environment consisting of 1 server and 5 client workstations.

---

## 1. Network Topology and Port Allocation

To support lock screen controls, heartbeats, and database updates, the following ports must be open on the network:

```
[Student Mobile Device]
         ↓ (Port 3000 - HTTP Student Portal)
[Central Web Console / Next.js]
         ↓ (Port 5000 - API & WebSockets)
[ALAMS Central API Server] ──(Port 5432 - PG SQL)──> [Neon Database Cluster]
         ↑ (Port 5000 - WebSocket client connection)
[Workstation Client / Watchdog Service]
```

---

## 2. Server Deployment Workflow

### Step 1: Initialize Database
ALAMS uses a Neon PostgreSQL database. Ensure you have created a PostgreSQL cluster and have both the transaction connection pooled URL and direct connection URL.

### Step 2: Deploy Server API
1.  Copy the code repository to the server machine.
2.  Navigate to `scripts/` and run `install_server.bat` as an Administrator. This will install dependencies, generate the Prisma schema, run database migrations, and seed the database.
3.  Configure `server/.env` with your secure JWT secret keys, QR signing keys, and Database URLs.
4.  Run `start_server.bat` to launch the API and WebSocket listener on port 5000.

### Step 3: Start Web Dashboard Console
1.  Navigate to `web/` and copy `.env.local.example` to `.env.local`. Set the API server IP:
    `NEXT_PUBLIC_API_URL=http://[server-ip]:5000`
2.  Install dependencies and build the console:
    ```bash
    npm install
    npm run build
    npm start
    ```
3.  Ensure the dashboard is responsive at `http://[server-ip]:3000`.

---

## 3. Workstation Deployment Workflow

Repeat these steps for each of the five pilot workstation computers:

### Step 1: Run Bootstrap Installer
1.  Ensure the .NET 8.0 Desktop Runtime is installed on the machine.
2.  Run `installer\bootstrap_installer.exe` as an Administrator.
3.  Provide the server API IP address when prompted. The wizard will query system specs via WMI, register the computer on the server, create configuration structures, and run a connectivity self-test.

### Step 2: Approve Workstation
1.  Log into the Admin Web Console (`http://[server-ip]:3000/admin`) using administrative credentials (`ADMIN01` / `Admin@ALAMS2026!`).
2.  Navigate to **Asset Inventory** -> **Pending Assets**.
3.  Click **Approve** and assign a PC seat number (e.g. `PC-01` through `PC-05`) and the lab zone (`SUAS Lab A`).

### Step 3: Finalize Shell Restrictions
1.  Run `scripts\install_client.bat` on the workstation to copy production binaries, install the `AlamsWatchdog` service, and configure the student registry shell override.
2.  Log off the administrative account and log in as the target restricted `Student` user. The computer will boot directly into the lock screen displaying the active QR code.

---

## 4. Post-Deployment Verification (Smoke Test)

Run the post-deployment smoke test to verify all systems are operating normally:
```powershell
powershell -ExecutionPolicy Bypass -File .\tests\smoke_test.ps1
```
If all tests pass, the workstation is fully ready for student classes and attendance auditing.
