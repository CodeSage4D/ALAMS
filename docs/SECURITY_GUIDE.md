# ALAMS Security Guide

## 1. Authentication Security

### JWT Tokens
- Signed with `JWT_SECRET` (minimum 32 chars recommended for production)
- 8-hour expiry (`expiresIn: 28800`)
- Role embedded in payload — enforced on every protected endpoint via `authorizeRoles()`
- **Action required before scaling**: Rotate `JWT_SECRET` to a 64-char random value

### QR Tokens
- Signed with `QR_SIGNING_KEY` (separate key from JWT)
- 60-second expiry — enforced by `jsonwebtoken` `expiresIn: 60`
- Single-use: session transitions from PENDING to ACTIVE on first valid PIN entry, invalidating the PIN
- QR URL format: `http://[server]:3000/unlock?token=[JWT]`

### Password & PIN Storage
- All passwords hashed with `bcrypt` (salt rounds = 10)
- All PINs hashed with `bcrypt` (salt rounds = 10)
- No plaintext credentials stored anywhere in the database

---

## 2. Concurrent Session Protection

- On every login attempt, the server queries for any existing `ACTIVE` session for the student
- If found, the new login is **rejected** and an `CONCURRENT_LOGIN_REJECT` audit log is created
- This prevents proxy/sharing of sessions across multiple workstations

---

## 3. CORS Configuration

- Allowed origins defined via `CORS_ORIGINS` environment variable (comma-separated)
- Default: `http://localhost:3000,http://localhost:5000`
- For pilot: add `http://[server-ip]:3000` to `CORS_ORIGINS`
- Non-browser clients (WPF, Watchdog) are permitted (`!origin` check)

---

## 4. Hardware Tamper Detection

When a registered workstation reconnects:
- BIOS serial, Motherboard serial, CPU ID are compared against stored values
- If any mismatch: `CRITICAL` `SecurityAlert` created + `HARDWARE_TAMPER` `AuditLog` entry
- Administrator is notified via Security Alerts dashboard panel

---

## 5. Subnet Validation

- Each Lab has an optional `subnet` field (CIDR notation, e.g., `10.0.3.0/24`)
- On workstation registration, server checks if workstation IP is within the lab subnet
- Mismatch triggers a `WARNING` `SecurityAlert` and `SUBNET_MISMATCH` AuditLog
- Visible in Admin Dashboard > Asset Inventory as orange warning badge

---

## 6. Watchdog Service

- Runs on each workstation as a background Windows service
- Reports heartbeat every 30 seconds to `/api/v1/client/watchdog-heartbeat`
- On abnormal process termination (e.g., client killed): reports `watchdog_kill` alert
- Server sets session to `TERMINATED` and computer to `APPROVED`
- Forces lock screen recovery on next client launch

---

## 7. Audit Trail

All critical actions are recorded in the immutable `AuditLog` table:

| Action | Trigger |
|--------|---------|
| `STUDENT_LOGIN` | Successful 2FA PIN verify |
| `STUDENT_LOGIN_FALLBACK` | Successful local PIN auth |
| `STUDENT_LOGOUT` | Logout with duration |
| `CONCURRENT_LOGIN_REJECT` | Duplicate session blocked |
| `DEVICE_APPROVED` | Admin approves workstation |
| `DEVICE_STATUS_UPDATE` | Admin changes device status |
| `HARDWARE_TAMPER` | Hardware config mismatch |
| `SUBNET_MISMATCH` | IP outside lab subnet |
| `FACULTY_LOCK_ALL` | Faculty locks all PCs |
| `FACULTY_END_ALL` | Faculty ends all sessions |
| `PRACTICAL_STARTED` | Faculty starts practical |
| `PRACTICAL_ENDED` | Faculty ends practical |

AuditLogs are **append-only** — no update or delete routes exist.

---

## 8. Known Security Limitations (Pilot Scope)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| JWT_SECRET is human-readable in .env | Medium | Rotate to random 64-char value before scaling |
| Offline PIN hardcoded to `123456` in client fallback | Medium | Remove hardcoded check; implement local encrypted cache |
| No rate limiting on auth endpoints | Medium | Add `express-rate-limit` before public deployment |
| QR image fetched from external API (qrserver.com) | Low | Self-host QR generator for air-gapped environments |
| Database credentials in .env (plaintext) | Low | Use secret manager for production scale |

---

## 9. Recommended Actions Before Scaling Beyond Pilot

1. Rotate all secret keys to cryptographically random values
2. Add `express-rate-limit` middleware (max 10 attempts/minute per IP)
3. Enable HTTPS (TLS) on server and web console
4. Remove hardcoded offline PIN fallback from WPF client
5. Implement local encrypted credential cache for offline mode
6. Add database connection pooling monitoring
