# ALAMS — System Architecture

## Overview

AURXON Lab Access Management System (ALAMS) is a multi-tier enterprise system for university computer lab access control and automated attendance.

## System Components

```
+-----------------------------------------------------------------+
¦                        CLIENT LAYER                             ¦
¦  +------------------+   +--------------+   +----------------+  ¦
¦  ¦  WPF Lock Client  ¦   ¦  Session     ¦   ¦  Watchdog      ¦  ¦
¦  ¦  (AlamsClient)    ¦   ¦  Widget      ¦   ¦  Service       ¦  ¦
¦  ¦  .NET 8 / WPF     ¦   ¦  (Float UI)  ¦   ¦  (Background)  ¦  ¦
¦  +------------------+   +--------------+   +----------------+  ¦
+-----------+----------------------+--------------------+---------+
            ¦  WebSocket + REST    ¦                    ¦ REST
+-----------+----------------------+--------------------+---------+
¦           ¦    SERVER LAYER (Domain Modular)                  ¦
¦  +--------?----------------------?--------------------?------+  ¦
¦  ¦  [auth]       - Email + Password login, OTP 2FA, gateways  ¦  ¦
¦  ¦  [session]    - Active workstation trackers, bypass PINs   ¦  ¦
¦  ¦  [workstation]- Computer inventory, pairing, remote lock   ¦  ¦
¦  ¦  [attendance] - Attendance logs, lessons, credit hours     ¦  ¦
¦  ¦  [import-exp] - Student Excel template parser & validators ¦  ¦
¦  ¦  [monitoring] - System health, diagnostics alerts, audit   ¦  ¦
¦  ¦  [sync]       - Local-to-Cloud replication services        ¦  ¦
¦  ¦                                                            ¦  ¦
¦  ¦         WebSocket Server (ws library)                      ¦  ¦
¦  +------------------------------------------------------------+  ¦
+-----------------------------+-----------------------------------+
                              ¦ Prisma ORM
+-----------------------------+-----------------------------------+
¦         DATABASE LAYER      ¦                                   ¦
¦  +--------------------------?------------------------------+   ¦
¦  ¦           PostgreSQL Database (Local Offline Loopback)   ¦   ¦
¦  ¦  Users · Labs · Computers · Sessions · Attendance        ¦   ¦
¦  ¦  Subjects · TimetableSlots · AuditLogs · SecurityAlerts  ¦   ¦
¦  +----------------------------------------------------------+   ¦
+-----------------------------------------------------------------+
```

## Authentication Flows

### Primary Login (Online Mode)
1. Student enters their registered **College Email** (`student@suas.ac.in`) or **Enrollment Number** and Password on the workstation lock screen.
2. Workstation submits credentials to the server via the `/api/v1/client/fallback-auth` endpoint.
3. Server validates credentials against the local PostgreSQL instance, checking user status (`isActive`) and password validity.
4. On success, an active database session is registered, the WebSocket unlocks the client, and the Windows Explorer shell is spawned.

### PIN Fallback (Resilient Offline Mode)
1. In case of local LAN network failure, the indicator on the workstation lock screen transitions to **OFFLINE**.
2. The student checks their offline bypass checkbox and inputs their Enrollment Number and administrator-issued 6-digit offline bypass PIN.
3. The client verifies the credentials locally against the cached local student credentials database (comparing hashes using BCrypt).
4. On successful verification, the lock screen hides and allows local access, logging the session to a local transaction journal for automatic syncing once connectivity is restored.

## Security Architecture
- JWT signed with JWT_SECRET (28800s TTL = 8 hours)
- QR tokens signed with QR_SIGNING_KEY (60s TTL, one-time)
- bcrypt salt=10 for all passwords and PINs
- CORS origin whitelist from CORS_ORIGINS env var
- RBAC enforced on every protected endpoint
- Immutable AuditLog for every critical action
- Hardware fingerprint = SHA-256(Motherboard+BIOS+CPU+MAC)
- Concurrent session rejection (one active session per student)

## Database Models
- **User** — STUDENT / ADMIN / SUPERVISOR / FACULTY roles
- **Profile** — Reusable configuration template (QR lifetime, heartbeat interval)
- **Lab** — Physical room with subnet and profile assignment
- **Computer** — Workstation with full WMI hardware + network specs
- **TimetableSlot** — Weekly schedule linking Lab ? Subject ? Faculty
- **Session** — Active/Completed/Terminated workstation sessions
- **Attendance** — Finalized attendance record (Present/Late/Partial/Absent)
- **SecurityAlert** — Hardware tamper, subnet mismatch, failed login alerts
- **AuditLog** — Immutable action trail

## Network Architecture (Local LAN Offline-First)
- Server: http://127.0.0.1:5000 (accessible on LAN as http://192.168.128.73:5000)
- All client workstations communicate locally within the laboratory network.
