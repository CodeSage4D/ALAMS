# ALAMS Administrator Guide

This document describes operation procedures for system administrators managing the **ALAMS (Aurxon Lab Access Management System)**.

---

## 1. Accessing the Dashboard Console

The Admin Dashboard Console is accessible from any network-connected browser:
*   **Web Address**: `http://[server-ip]:3000`
*   **Default Credentials**:
    *   **Account ID**: `karan.mishra@suas.ac.in` (or other seeded admin emails)
    *   **Password**: `Pilot@2026!`
    *   **Fallback PIN**: `112233`
*   *Note: Administrators are required to change their passwords upon first login.*

---

## 2. Asset Inventory & Workstation Pairing

When a new computer executes the [Bootstrap Wizard](BOOTSTRAP_GUIDE.md), it submits system fingerprints and is registered as `PENDING`.

To authorize the machine:
1.  Navigate to **Asset Inventory** -> **Pending Workstations**.
2.  Review the hostname, MAC address, and hardware fingerprint.
3.  Click **Approve**.
4.  In the pairing popup, assign:
    *   **Friendly PC Name** (e.g. `SUAS-LABA-PC01`)
    *   **Seat Number** (e.g. `PC-01`)
    *   **Lab Zone** (e.g. `SUAS Lab A`)
5.  Click **Save**. The workstation is now authorized and begins rendering dynamic QR login screens.

---

## 3. Remote Workstation Controls

The control panel provides real-time state management for all approved workstations:
*   **Remote Unlock**: Bypasses QR code authentication to immediately unlock a machine (e.g. for maintenance or exams).
*   **Remote Lock**: Terminates the active student session, kills Explorer, and locks the screen.
*   **Lock All**: Send a broadcast lock command to every active machine in a lab zone.
*   **End All Sessions**: Log off all students and compile attendance reports.

---

## 4. Handling Security Alerts

The watchdog service automatically logs security events under the **Security Monitor** panel.

### Violation Types:
*   `watchdog_kill`: Occurs if a student shuts down the client UI process (`AlamsClient.exe`) while Windows Explorer is active. The watchdog service automatically logsoff the student and raises this critical alert.
*   `failed_pin_verification`: Occurs if someone attempts to crack the lock screen by entering incorrect session PINs.

### Resolution Workflow:
1.  Locate the alert in the **Security Monitor** feed.
2.  Review the workstation ID, timestamp, and active student session details.
3.  Inspect the physical workstation for tampering.
4.  Click **Resolve Alert** and enter resolution notes.

---

## 5. Configuration Profiles

Profiles control screen behaviors at a Lab Zone level:
*   **QR Code Lifetime**: Frequency in seconds that the dynamic QR code is refreshed.
*   **Heartbeat Timeout**: Allowed latency threshold before flagging a machine offline.
*   **Fallback Login**: Toggle switches to permit/disable local PIN logins.
*   **Session Timeout**: Max class duration (default 120 minutes) before forcing automatic locks.
