# ALAMS Pilot Setup & Operations Manual

This step-by-step user manual describes how to deploy the **ALAMS (Aurxon Lab Access Management System)** on the central server and configure the client workstations for the pilot series test.

---

## 1. Server PC Deployment (Central Lab Server)

Follow these steps to prepare the central ALAMS server:

### Step A: System Prerequisites
Ensure the server PC has the following installed:
1.  **Node.js 20 LTS** or later (Verify via `node -v`).
2.  **Git** command line tools.
3.  **Active Internet Connection** to reach the Neon Cloud Database.

### Step B: Clone and Install
1.  Open PowerShell as an Administrator.
2.  Navigate to the repository directory:
    ```powershell
    cd "d:\Project Data Aurxon\ALAMS"
    ```
3.  Run the automated server install script:
    ```powershell
    .\scripts\install_server.bat
    ```
    *This script installs dependencies (`npm install`), generates the database schema mappings (`prisma generate`), and seeds default admin, supervisor, faculty, and student credentials.*

### Step C: Configure Variables (`.env`)
Verify the database connection strings in `server/.env`:
*   Ensure `DATABASE_URL` (pooled connection) and `DIRECT_URL` (direct migration connection) match your active PostgreSQL cluster.

### Step D: Launch Server via Control Center
To start, stop, or monitor the ALAMS service without executing raw terminal commands:
1.  Run the **ALAMS Control Center**:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\ControlCenter.ps1
    ```
2.  Select **Option 1** (`Start ALAMS Server`). A background console will open, initializing the backend.
3.  Select **Option 9** (`Check Server Health`) to run checks.
    *   **Expected output**:
        ```
        [PASS] Server is healthy (status: healthy)
        [PASS] Database is connected and verified.
        Seeded assets metrics: {"labs":1,"computers":5,"profiles":2,"subjects":3}
        ```

---

## 2. Workstation Client PC Setup

Complete this workflow sequentially, starting with **1 workstation** (PC-01), then scaling to **3 workstations** (PC-01 to PC-03), and finally all **5 workstations** (PC-01 to PC-05).

### Step A: Prerequisites on Workstation
1.  Install **.NET 8.0 Desktop Runtime** on the workstation.
2.  Create a standard Windows user account named **`Student`**.
3.  Set the `Student` account to **Auto-Logon** in Windows (using `netplwiz` or Sysinternals Autologon).

### Step B: Pair Machine (Bootstrap Wizard)
1.  Copy the folder `ALAMS_Pilot_v1.0/client` from the server package to the target workstation.
2.  Open PowerShell as an Administrator and execute the bootstrap wizard:
    ```powershell
    .\bootstrap_installer.exe
    ```
3.  The wizard will search for the server. If prompted, input the server IP address:
    `http://[server-ip]:5000`
4.  The bootstrapper will:
    *   Query host hardware serials via WMI.
    *   Connect over WebSockets and submit specifications.
    *   Print a color-coded **PASS/FAIL** diagnostics report.

### Step C: Approve on Web Console
1.  Log into the Web Console at `http://[server-ip]:3000` using the Administrator email:
    *   **Username**: `karan.mishra@suas.ac.in`
    *   **Password**: `Pilot@2026!`
2.  Go to **Asset Inventory** -> **Pending Assets**.
3.  Select the workstation, click **Approve**, and assign:
    *   **Lab Zone**: `SUAS Lab A`
    *   **PC Number**: `PC-01` (assign PC-02, PC-03, etc., as you scale).

### Step D: Lock Student Shell
1.  On the workstation, run the installation script as an Administrator:
    ```powershell
    .\install_client.bat "http://[server-ip]:5000"
    ```
    *This registers the `AlamsWatchdog` Windows service, locks user controls, and overwrites the Registry shell.*
2.  Log out of the Administrator account and log in as the **`Student`**. The PC will boot directly into the secure ALAMS Lock Screen.

---

## 3. Pilot Series Test Scenarios

### Series A: 1-PC Verification (Workstation PC-01)
*   **Goal**: Validate the core dynamic QR access flow.
*   **Workflow**:
    1.  Confirm PC-01 shows the dynamic QR code block and status shows **ONLINE**.
    2.  Scan QR code with a mobile phone and log into the Student Portal (`ENR2026001` / `Student@2026!`).
    3.  Enter the generated 6-digit session PIN on PC-01.
    4.  Verify the lock screen hides, the Windows desktop taskbar starts, and the floating Session Widget appears.
    5.  Click **Log Out** on the widget. The workstation must terminate explorer, save check-out, and return to the lock screen.

### Series B: 3-PC Concurrency & Resiliency (PCs PC-01 to PC-03)
*   **Goal**: Validate multi-device sessions and offline fallback behavior.
*   **Workflow**:
    1.  Verify three virtual/physical students log in and unlock PC-01, PC-02, and PC-03 simultaneously.
    2.  Student at PC-02 attempts to login to PC-03. Verify the server rejects access (`CONCURRENT_LOGIN_REJECT`).
    3.  Simulate network failure by unplugging the ethernet cable on PC-02. Verify the indicator transitions to **OFFLINE**.
    4.  Verify student logs in using local offline credentials (`ENR2026002` / PIN: `123456`).

### Series C: 5-PC Class Audit Load (PCs PC-01 to PC-05)
*   **Goal**: Full timetable integration and supervisor dashboard checks.
*   **Workflow**:
    1.  Boot all 5 workstations and confirm they are in a locked state.
    2.  Check the **Active Sessions** tab on the Faculty Console. Confirm all 5 grid blocks match the physical workstation layout.
    3.  Verify student logs in more than 15 minutes after class starts. Verify their attendance is flagged as **LATE**.
    4.  In the Admin Console, trigger **Lock All**. Confirm all 5 screens lock simultaneously.
    5.  Query diagnostics and run `backup_database.bat` from the Control Center console to confirm data preservation.
