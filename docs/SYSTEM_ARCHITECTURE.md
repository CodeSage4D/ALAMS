# ALAMS — System Architecture

## Overview

AURXON Lab Access Management System (ALAMS) is a multi-tier enterprise system for university computer lab access control and automated attendance.

## System Components

`
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
¦           ¦    SERVER LAYER      ¦                    ¦         ¦
¦  +--------?----------------------?--------------------?------+  ¦
¦  ¦              Express.js API Server (Node.js)               ¦  ¦
¦  ¦  +----------+ +----------+ +----------+ +------------+   ¦  ¦
¦  ¦  ¦  Auth    ¦ ¦  Admin   ¦ ¦  Client  ¦ ¦ Analytics  ¦   ¦  ¦
¦  ¦  ¦Controller¦ ¦Controller¦ ¦Controller¦ ¦ Controller ¦   ¦  ¦
¦  ¦  +----------+ +----------+ +----------+ +------------+   ¦  ¦
¦  ¦         WebSocket Server (ws library)                      ¦  ¦
¦  +------------------------------------------------------------+  ¦
+-----------------------------+-----------------------------------+
                              ¦ Prisma ORM
+-----------------------------+-----------------------------------+
¦         DATABASE LAYER      ¦                                   ¦
¦  +--------------------------?------------------------------+   ¦
¦  ¦           Neon PostgreSQL (Cloud Hosted)                 ¦   ¦
¦  ¦  Users · Labs · Computers · Sessions · Attendance        ¦   ¦
¦  ¦  Subjects · TimetableSlots · AuditLogs · SecurityAlerts  ¦   ¦
¦  +----------------------------------------------------------+   ¦
+-----------------------------------------------------------------+
`

## Authentication Flows

### QR + One-Time PIN (Primary)
1. Student opens mobile browser ? /unlock?token=JWT
2. Student logs in (enrollment + password)
3. Server validates ? Generates 6-digit OTP (60s TTL, bound to student + workstation)
4. Student receives PIN on mobile
5. Student enters PIN on workstation lock screen
6. Server validates PIN ? Activates session ? Sends WebSocket unlock to workstation
7. Explorer shell launched, lock screen hidden

### PIN Fallback (Offline capable)
1. Student enters enrollment + PIN directly on workstation
2. Workstation POSTs to /api/v1/client/fallback-auth
3. Server bcrypt-validates PIN against hashed DB record
4. On success ? session created, workstation unlocked

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

## Network Architecture (Pilot)
- Server: http://[server-ip]:5000
- Web Console: http://[server-ip]:3000
- Mobile Unlock: http://[server-ip]:3000/unlock
- WS: ws://[server-ip]:5000
- All workstations communicate on local LAN
