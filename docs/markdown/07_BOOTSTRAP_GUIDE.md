# ALAMS Workstation Bootstrap Wizard Guide

This document describes how to use the **ALAMS Bootstrap Wizard (`bootstrap_installer.exe`)** to configure and register physical laboratory computers.

---

## 1. Overview

The **Bootstrap Wizard** is a C# console application designed to automate the configuration and deployment sequence on student workstations. Rather than manually copying binaries, editing configurations, setting up Windows services, and rewriting registry entries, the deployment engineer can run this single utility to complete the setup in under a minute.

---

## 2. Execution Workflow

To run the bootstrap installer, navigate to the installer directory and run as an Administrator:
```powershell
# Run the bootstrapper wizard
.\installer\bootstrap_installer.exe
```

The installer runs through six distinct phases:

### Step 1: Detect Windows Environment
The wizard checks local environment configurations:
*   **Privileges Check**: Validates if the wizard is running with full Local Administrator permissions.
*   **Runtime Version**: Verifies that the .NET 8.0 runtime is installed.
*   **Existing Configuration**: Reads existing configs from `C:\ProgramData\ALAMS\config.json` if a reinstallation is performed.

### Step 2: Locate ALAMS Server
The wizard tries to locate the central API server:
*   **Auto-Discovery**: Attempts to ping and call `/health` on loopback addresses or local gateway subnets.
*   **Manual Entry**: If auto-discovery fails, the wizard prompts the engineer for the Server URL (e.g. `http://10.0.3.5:5000`).
*   **API & WebSocket Validation**: The wizard connects to the HTTP API and tests the WebSocket handshake. Installation stops if either check fails.

### Step 3: Collect Device Information
The wizard audits workstation specifications using WMI (Windows Management Instrumentation):
*   **Network specs**: Hostname, local IPv4, and MAC address.
*   **Hardware audit**: CPU Identifier, Motherboard Serial Number, BIOS Serial Number, System UUID, RAM configuration, and primary Hard Drive size.
*   **Fingerprint generation**: Creates a unique SHA-256 hash combining hardware IDs to protect against MAC spoofing.

### Step 4: Register Device
The wizard initiates the registration handshake over WebSockets:
*   **Submission**: Transmits the collected specifications and hardware fingerprint to the server.
*   **Workstation Status**: The server registers the computer. If it's a new system, it is flagged as `PENDING APPROVAL` on the Admin console.
*   **Workstation ID**: The server returns a persistent Workstation ID UUID which the wizard saves.

### Step 5: Configure Workstation
The wizard provisions local configurations:
*   Creates directories `C:\Program Files\ALAMS` and `C:\ProgramData\ALAMS`.
*   Writes `config.json` containing the server URL and the newly received computer UUID.
*   Copies runtime binaries (`AlamsClient.exe` and `AlamsWatchdog.exe`) to Program Files.

### Step 6: Execute Self-Test
The wizard performs a final post-install test suite:
*   Verifies HTTP communication with the server.
*   Validates database connectivity via diagnostic API endpoints.
*   Establishes a WebSocket test connection.
*   Validates client settings file parsing.
*   Displays a color-coded **PASS/FAIL** report.

---

## 3. Post-Installation Step

Once the bootstrap wizard completes successfully, the workstation will display a **UNPAIRED** status screen. To complete the pairing:
1.  Log into the Admin Web Console (`http://[server-ip]:3000`).
2.  Navigate to **Asset Inventory** -> **Pending Workstations**.
3.  Locate the new machine (matched by Hostname and Hardware Fingerprint).
4.  Click **Approve**, and assign the Lab Zone and Seat Number.
5.  The workstation lock screen will immediately receive the configuration over WebSockets, display the assigned seat number, and begin rendering active QR code logins.
