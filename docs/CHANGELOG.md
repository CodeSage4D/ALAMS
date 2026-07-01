# ALAMS Changelog

## v1.0.0 — Pilot Release (2026-06-28)

### Phase 1 — Core Foundation
- Express.js REST API server with JWT authentication
- Prisma ORM with Neon PostgreSQL schema
- WPF lock screen client (AlamsClient.exe)
- Watchdog background service (AlamsWatchdog.exe)
- WebSocket server for real-time workstation communication
- Admin dashboard (Next.js)
- Basic QR code display on lock screen
- PIN fallback authentication
- Student login/signup (mobile web)

### Phase 2 — Production Hardening
- RBAC (Admin / Supervisor / Faculty / Student roles)
- Session management with duplicate login detection
- Security alerts system
- Audit logging (immutable AuditLog table)
- Password change and reset flow
- Admin remote unlock / lock commands
- Pilot analytics dashboard

### Phase 3 — Pilot Readiness
- Database migration stability
- Seed script with pilot accounts and demo data
- Production build verification
- LaTeX user manual documentation

### Phase 4 — Device Discovery & Asset Management
- Automatic workstation registration via WebSocket on first launch
- WMI hardware inventory collection:
  - BIOS Serial, Motherboard Serial, CPU ID, Computer UUID
  - RAM, Storage, OS Version, Client Version
- Network specification discovery:
  - IPv4, IPv6, Gateway, DNS, Active Adapter, Domain/Workgroup
- SHA-256 hardware fingerprint generation
- Hardware tamper detection with CRITICAL security alerts
- Pending device approval workflow
- Configuration Profile system (Lab-level QR lifetime, heartbeat interval)
- Subnet validation with CIDR matching
- Asset Inventory dashboard panel with WMI detail modal

### Phase 5 — Academic Management & Secure Attendance
- Timetable integration (TimetableSlot model with Lab/Subject/Faculty mapping)
- Automatic class detection at session creation time
- One-time session PIN (6-digit, 60s TTL, workstation + student bound)
- QR + PIN two-factor authentication flow
- Attendance lifecycle: Session PENDING → PIN verify → ACTIVE → Logout → finalized
- Late detection: >15min after class start = LATE
- Duration thresholds: <15min = ABSENT, <45min = PARTIAL, ≥45min = PRESENT/LATE
- Practical hours credit calculation (duration / 60)
- Faculty Command Deck: Start/End Practical, Lock All, End All Sessions
- Attendance CSV export from dashboard

### Pilot Sprint Completion (v1.0.0 Final)
- CORS hardened with origin whitelist from environment variable
- JSON body size limit (1MB) applied
- Trust proxy enabled for production nginx deployment
- Student Portal dashboard (GET /api/v1/student/attendance)
- Student attendance page: percentage ring, metric cards, session history
- Login redirects students to /student/dashboard
- All 16 documentation files generated
- Final TypeScript compilation verified (server: 0 errors)
- Final Next.js production build verified (10 pages, 0 errors)

---

## Known Issues (Tracked for v1.1.0)

- Offline mode uses hardcoded PIN `123456` (pilot acceptable, must fix before scale)
- No HTTP rate limiting on auth endpoints
- QR code fetched from external `api.qrserver.com` (requires internet)
- JWT/QR secrets are human-readable strings (rotate before scaling)
