# ALAMS Rollback and Uninstall Guide

This document describes how to safely undo and roll back all **ALAMS (Aurxon Lab Access Management System)** deployments from workstations and servers in the event of pilot execution issues.

---

## 1. Workstation-Side Rollback (Restoring Explorer Desktop)

If a workstation becomes unresponsive or locked in a loop, follow these steps to restore standard Windows operation.

### Option A: Run the Uninstaller Script (Recommended)
Log in as the Local Administrator, open Command Prompt as Administrator, and run:
```batch
.\scripts\uninstall_client.bat
```
This script will automatically:
1.  Stop and delete the `AlamsWatchdog` service.
2.  Restore default Registry shell keys for student accounts (removing the HKCU Winlogon shell override).
3.  Purge files from `C:\Program Files\ALAMS` and `C:\ProgramData\ALAMS`.

### Option B: Manual Registry Shell Restoration
If the uninstall script cannot run, restore the Windows shell manually:
1.  Boot the machine. Since the student shell might be locked, press `Ctrl + Alt + Delete` and select **Sign out** (or log in as the Administrator).
2.  Press `Win + R`, type `regedit.exe`, and press Enter to open the Registry Editor.
3.  Navigate to:
    `HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`
4.  Locate the string value named `Shell`.
5.  Right-click `Shell` and select **Delete** (or change its value data to `explorer.exe`).
6.  Restart the computer and log in as the Student. The default Windows explorer taskbar and desktop will load.

---

## 2. Server-Side Rollback

To stop the central server and restore database connections:

### Step 1: Terminate Node Server Processes
Run the stop server script:
```batch
.\scripts\stop_server.bat
```
If using PM2 process manager:
```bash
pm2 delete alams-server
pm2 save
```

### Step 2: Purge or Drop Database Schemas
To drop all tables and clear the PostgreSQL instance:
```powershell
cd server
npx ts-node prisma/clear-db.ts
```
*(Or drop schemas directly via the Neon dashboard under Tables -> Delete all).*
