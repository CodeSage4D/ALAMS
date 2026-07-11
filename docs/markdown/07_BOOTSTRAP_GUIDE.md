# ALAMS Workstation Enrollment Guide

This document describes how to use the **ALAMS Workstation Enrollment Script (`EnrollWorkstation.ps1`)** to configure and register physical laboratory computers.

---

## 1. Overview

The **Enrollment Script** is a lightweight administrative PowerShell script designed to automate the configuration and deployment sequence on student workstations. Rather than manually copying binaries, editing configurations, setting up Windows services, and rewriting registry entries, the deployment engineer can run this single utility to complete the setup in under a minute.

This replacement ensures that exactly three executables are compiled and packaged in the ALAMS suite.

---

## 2. Execution Workflow

To run the enrollment script, open a PowerShell window with **Administrator** privileges, navigate to the scripts directory, and execute:
```powershell
# Set execution bypass and run the enrollment script
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\EnrollWorkstation.ps1
```

The script runs through four distinct phases:

### Step 1: Discover ALAMS Server
The script tries to locate the central management console:
*   **UDP Beacon Listening**: Listens on UDP port `35200` for the server's broadcast beacon. If detected, it auto-configures the server URL.
*   **Manual Entry**: If auto-discovery fails or the beacon is offline, the script prompts the engineer for the Server URL (e.g. `http://192.168.128.73:5000`).
*   **Health Validation**: Sends a GET request to `/health` to verify server and database connectivity.

### Step 2: Gather System Specifications
The script audits workstation specifications using WMI (Windows Management Instrumentation) cmdlets:
*   **Network specs**: Hostname, local IPv4, and MAC address.
*   **Hardware audit**: CPU Identifier, Motherboard Serial Number, System UUID, BIOS Serial Number, RAM capacity, and primary Hard Drive size.
*   **Fingerprint generation**: Creates a unique SHA-256 hash combining hardware IDs to protect against MAC spoofing.

### Step 3: Register Workstation
The script initiates the registration handshake over HTTP REST APIs:
*   **Submission**: Transmits the collected specifications and hardware fingerprint via POST to `http://[server-ip]:5000/api/v1/client/enroll`.
*   **Workstation Status**: The server registers the computer. If it's a new system, it is flagged as `PENDING APPROVAL` on the Command Center and the next sequential seat number is reserved.
*   **Workstation ID**: The server returns a persistent Workstation ID UUID which the script captures.

### Step 4: Write Local Configuration
The script provisions local configuration files:
*   Creates directories `C:\ProgramData\ALAMS\`.
*   Writes `config.json` containing the server URL, default parameters, and the newly received computer UUID.
*   Sets up default parameters for fallback verification checks.

---

## 3. Post-Enrollment Step

Once the script completes successfully, the workstation client UI will load showing the **UNPAIRED** status screen. To complete the pairing:
1.  Log into the Command Center or Web Console (`http://[server-ip]:3000`).
2.  Navigate to **Device Fleet** -> **Pending Workstations**.
3.  Locate the new machine (matched by Hostname and Hardware Fingerprint).
4.  Click **Approve**, and assign the Lab Zone and Seat Number.
5.  The workstation lock screen will immediately receive the configuration, display the assigned seat number, and begin rendering active QR code logins.

