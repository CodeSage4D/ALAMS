# ALAMS Go-Live Checklist

This checklist must be fully completed and signed off by the DevSecOps Lead and QA Lead before deploying **ALAMS (Aurxon Lab Access Management System)** in production.

---

## 1. Server-Side Infrastructure Verification

*   [ ] **Server Runtime**
    *   API server is running in production environment mode (`NODE_ENV=production`).
    *   Default HTTP port 5000 is open in the server firewall.
*   [ ] **Database Connection**
    *   Prisma schema is pushed and synced with PostgreSQL.
    *   Diagnostics report `dbConnected: true`.
    *   Neon database pool parameters are configured to prevent connection starvation.
*   [ ] **Seeding and Credentials**
    *   Administrative accounts are seeded.
    *   Faculty demo credentials verified.
    *   10 default student accounts verified.
*   [ ] **Security Configuration**
    *   `JWT_SECRET` has been changed from default template keys.
    *   `QR_SIGNING_KEY` has been changed from default template keys.
    *   `CORS_ORIGINS` strictly whitelists the domain of the Web dashboard.

---

## 2. Web Console Verification

*   [ ] **Dashboard Console**
    *   Next.js dashboard builds and starts on port 3000.
    *   API connection matches target server IP and port 5000.
*   [ ] **Functionality Audit**
    *   Asset Inventory loads and lists all paired workstations.
    *   Real-time session monitor responds to WebSocket disconnect/connect events.
    *   Security Alerts dashboard lists historical test alerts.

---

## 3. Workstation-Side Verification (Per Machine)

*   [ ] **Prerequisites**
    *   .NET 8.0 Desktop Runtime is installed.
    *   Student Windows user account created and configured for auto-logon.
*   [ ] **Bootstrap Setup**
    *   Bootstrap wizard executes successfully with no failures.
    *   Local `C:\ProgramData\ALAMS\config.json` contains valid server URL and workstation UUID.
*   [ ] **Windows Shell Restriction**
    *   HKCU Winlogon `Shell` registry points to `C:\Program Files\ALAMS\AlamsClient.exe`.
    *   Original shell is backed up to `C:\ProgramData\ALAMS\shell_backup.txt`.
*   [ ] **Watchdog Service**
    *   `AlamsWatchdog` Windows service status shows `Running`.
    *   Startup type configured as `Automatic`.
*   [ ] **QA Validation**
    *   Run `smoke_test.ps1` and verify all tests return `PASS`.
