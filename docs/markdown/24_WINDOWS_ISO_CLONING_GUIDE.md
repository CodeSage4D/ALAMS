# 📀 ALAMS - Windows ISO Master Image & Network Lab Cloning Guide

This document provides step-by-step instructions for creating a master Windows ISO image pre-configured with ALAMS (Aurxon Lab Access Management System) for rapid deployment across computer laboratory workstations via LAN network cloning (PXE / Clonezilla / WDS).

---

## 🚀 Overview of Network Cloning Strategy

```
 +------------------------+
 | Master Workstation PC  |
 | - Windows 10/11 Pro    |
 | - ALAMS Client Installed|
 | - Sysprep / Master Prep|
 +-----------+------------+
             |
             v  (Capture Image)
 +-----------+------------+
 | Windows ISO / WDS /    |
 | Clonezilla Master Img  |
 +-----------+------------+
             |
             +--------------------+--------------------+
             |                    |                    |
             v                    v                    v
      [ Workstation 01 ]   [ Workstation 02 ]   [ Workstation N ]
      - Auto-generates     - Auto-generates     - Auto-generates
        Unique HWID          Unique HWID          Unique HWID
      - Auto-enrolls       - Auto-enrolls       - Auto-enrolls
```

---

## 🛠️ Step 1: Prepare the Master Workstation

1. Install a clean copy of **Windows 10 Pro or Windows 11 Pro** on a reference computer.
2. Install all required laboratory software (e.g. VS Code, Python, Office, GCC, Chrome).
3. Copy the compiled ALAMS Client binaries (`AlamsClient.exe` and `AlamsDaemon.exe`) to:
   `C:\Program Files\ALAMS\`
4. Open PowerShell as **Administrator** and run the Master Preparation script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "d:\Project Data Aurxon\ALAMS\scripts\PrepareMasterImage.ps1" -ServerIp "192.168.128.73"
   ```
   *This script clears cached machine GUIDs, creates the local `Student` account with autologon, sets up registry run hooks, and configures Windows Firewall rules.*

---

## ⚙️ Step 2: Generalize System via Windows Sysprep

1. Open CMD as **Administrator** on the Master PC.
2. Execute Sysprep to strip system-specific SID identifiers:
   ```cmd
   C:\Windows\System32\Sysprep\sysprep.exe /generalize /oobe /shutdown /unattend:"d:\Project Data Aurxon\ALAMS\scripts\autounattend.xml"
   ```
3. The computer will shut down automatically when Sysprep completes. **Do NOT boot into Windows on this machine again until after capturing the image!**

---

## 📦 Step 3: Capture the Master Image

You can capture the master image using any of the following tools:

### Option A: Clonezilla Network PXE Server (Recommended)
1. Boot the Master PC into a **Clonezilla Live USB**.
2. Select **savedisk** mode to save the entire disk image to a shared network drive or USB drive.
3. Use Clonezilla SE (Server Edition) to multicast restore the image to all lab client machines simultaneously over LAN.

### Option B: Windows Deployment Services (WDS) / MDT
1. Boot the Master PC using a WDS Capture Boot Image.
2. Capture the disk volume into a `.wim` file on your WDS server.
3. Add the captured `.wim` image to WDS Install Images.

---

## 🌐 Step 4: Automated Endpoint Registration on First Boot

When cloned workstations boot up for the first time:
1. Windows initializes device drivers and autologs into the **Student** account.
2. `AlamsClient.exe` launches automatically and queries the local WMI hardware info.
3. Because `config.json` was wiped during preparation, the client auto-generates a **new, unique hardware fingerprint** based on its physical motherboard and CPU serials.
4. The client transmits a registration beacon to the Central Server IP (`http://[Server-IP]:5000`).
5. Open the Admin Web Console (`http://[Server-IP]:3000`) -> **Pending Workstations** -> Click **Approve** and assign PC Numbers (`PC-A01`, `PC-A02`, etc.).

---

## 🔍 Verification Checklist

- [x] Master Preparation script executed successfully.
- [x] Firewall rules for ports 5000 and 35200 applied.
- [x] `Student` local user created and set to autologon.
- [x] Sysprep generalized SID successfully.
- [x] Cloned endpoint auto-registered with unique fingerprint on central server console.
