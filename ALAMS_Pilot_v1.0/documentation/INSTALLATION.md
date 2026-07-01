# ALAMS Installation Guide

This guide describes how to deploy the **ALAMS (Aurxon Lab Access Management System)**.

## Prerequisites

### Server Machine
- Node.js 20 LTS or later
- npm 10+
- Git
- Network access to Neon PostgreSQL (cloud)

### Workstation Machines (x5 pilot)
- Windows 10/11 (64-bit)
- .NET 8 Desktop Runtime (or .NET 8 SDK to compile from source)
- Network connectivity to Server (port 5000)
- Chrome/Edge for mobile unlock page

---

## Step 1 — Server Setup

Run the automated server install script:
```powershell
.\scripts\install_server.bat
```
This script runs `npm install`, copies `.env`, generates Prisma clients, runs database pushes, and seeds default records.

To launch the server in production mode:
```powershell
.\scripts\start_server.bat
```

---

## Step 2 — Web Console Setup

```powershell
cd web
npm install

# Configure environment variables
copy .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://[server-ip]:5000

# Compile and start console
npm run build
npm start
```

---

## Step 3 — Automated Workstation Bootstrapping (Per Machine)

1.  Copy the compiled `installer\bootstrap_installer.exe` to the workstation.
2.  Right-click and select **Run as Administrator**.
3.  Enter the ALAMS Server IP when prompted.
4.  The wizard will gather hardware details, connect over WebSockets, register a PENDING asset, configure local path structures, and run a self-test.

---

## Step 4 — Approve Workstations

1.  Log into the Admin Dashboard at `http://[server-ip]:3000`.
2.  Navigate to **Asset Inventory** -> **Pending Assets**.
3.  Find your workstation, click **Approve**, and assign the Lab Zone (`SUAS Lab A`) and PC Seat Number.

---

## Step 5 — Restrict Student Shell

To finalize workstation locking, run the client silent installer as an Administrator:
```batch
.\scripts\install_client.bat "http://[server-ip]:5000"
```
This script copies binaries to `C:\Program Files\ALAMS`, registers the `AlamsWatchdog` service, and configures the registry shell override.

---

## Step 6 — Verify Deployment

Verify workstation health by running the automated smoke test script:
```powershell
powershell -ExecutionPolicy Bypass -File .\tests\smoke_test.ps1
```
