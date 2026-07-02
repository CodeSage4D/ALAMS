# ALAMS Database Backup and Recovery Guide

This document describes the policies and execution procedures for data backup, replication, and disaster recovery of the **ALAMS (Aurxon Lab Access Management System)** database.

---

## 1. Overview and Backup Strategy

To ensure zero academic data loss (student logins and attendance checks), the database backup strategy is divided into:

1.  **Daily Backups**: Automated exports using the PostgreSQL custom binary format.
2.  **Weekly Offsite Backups**: Encrypted dumps stored in secondary network-attached storage.
3.  **Point-In-Time Recovery (PITR)**: Provided automatically by the Neon Serverless PostgreSQL host (retaining up to 7 days of history on the cloud dashboard).

---

## 2. Automated Daily Backups (Windows Task Scheduler)

To schedule automatic daily backups on the central ALAMS Server:

1.  Open **Windows Task Scheduler** (`taskschd.msc`).
2.  Click **Create Basic Task**.
3.  Set the name to `ALAMS_Database_Backup`.
4.  Set Trigger to **Daily** (e.g. at 21:00 PM after laboratory classes complete).
5.  Set Action to **Start a Program**.
6.  Browse to select:
    *   **Program/script**: `d:\Project Data Aurxon\ALAMS\scripts\backup_database.bat`
    *   **Start in**: `d:\Project Data Aurxon\ALAMS\scripts`
7.  Click **Finish**.
8.  Ensure the task is configured to run under a system account with Administrator privileges ("Run whether user is logged on or not").

---

## 3. Manual Backup and Restore Workflow

### Execute Manual Backup
Run the backup script directly:
```batch
.\scripts\backup_database.bat
```
This script reads the server connection strings, executes `pg_dump`, and saves the compressed database structure in the `backups/` directory with a timestamp (e.g. `backups\alams_backup_20260629_140000.sql`).

### Restore From a Backup File
To restore the database, pass the backup filename as an argument:
```batch
.\scripts\restore_database.bat alams_backup_20260629_140000.sql
```
**WARNING**: The restore process will purge the target database schema (`--clean`) before recreating all tables and records. Ensure no active student sessions are running during this time.

---

## 4. Disaster Recovery Playbook

In the event of a database corruption or loss of the Neon Cloud environment:

### Step 1: Deploy New Database
Register or provision a new project on [Neon](https://neon.tech) and copy the new Prisma Direct URL.

### Step 2: Configure Environment
Update the connection string in the `server/.env` file:
```env
DATABASE_URL="new-postgres-connection-url"
DIRECT_URL="new-postgres-direct-connection-url"
```

### Step 3: Apply Base Schema
Apply the Prisma schemas to the fresh database instance:
```powershell
cd server
npx prisma db push
```

### Step 4: Restore Backup Data
Exert the latest SQL dump file to restore session history:
```batch
cd ..
.\scripts\restore_database.bat [latest_backup_file.sql]
```

### Step 5: Verify Restoration
Run the diagnostics endpoint to confirm status:
```powershell
curl http://localhost:5000/api/v1/health/diagnostics
```
Ensure `dbConnected` is true and check that attendance data is matching expected counts.
