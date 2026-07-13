# ALAMS API Reference

**Base URL**: `http://[server-ip]:5000`

**Authentication**: All protected endpoints require `Authorization: Bearer [JWT]` header.

---

## Public Endpoints

### GET /health
Returns basic server health status.
```json
{ "status": "healthy", "timestamp": 1719561600000 }
```

### GET /api/v1/health/diagnostics
Returns full system diagnostics (DB connectivity, entity counts, subnet warnings).
```json
{
  "status": "healthy",
  "dbConnected": true,
  "metrics": { "labs": 1, "computers": 5, "profiles": 2, "subjects": 3 },
  "subnetStatus": "VALID",
  "warnings": []
}
```

---

## Authentication API

### POST /api/v1/auth/login
```json
Request:  { "enrollmentNumber": "ENR2026001", "password": "Student@2026!" }
Response: { "token": "JWT", "user": { "id", "enrollmentNumber", "fullName", "role" } }
```

### POST /api/v1/auth/signup
```json
Request:  { "enrollmentNumber", "password", "pin", "fullName", "role" }
Response: { "token": "JWT", "user": {...} }
```

### POST /api/v1/auth/change-password `[JWT]`
```json
Request:  { "currentPassword", "newPassword" }
Response: { "message": "Password updated successfully" }
```

### POST /api/v1/auth/reset-password-request
```json
Request:  { "enrollmentNumber": "karan.mishra@suas.ac.in" }
Response: { "message": "Reset token generated" }
```

### POST /api/v1/auth/reset-password
```json
Request:  { "token": "reset-token", "newPassword": "NewPass@2026!" }
Response: { "message": "Password has been reset" }
```

---

## Admin / Faculty API `[JWT + ADMIN|SUPERVISOR|FACULTY]`

### GET /api/v1/admin/students
Returns all student accounts with status.

### PUT /api/v1/admin/students/:id/status `[ADMIN|SUPERVISOR]`
```json
Request:  { "isActive": false }
Response: { "id", "enrollmentNumber", "isActive" }
```

### GET /api/v1/admin/labs
Returns all labs with computer count.

### POST /api/v1/admin/labs `[ADMIN]`
```json
Request:  { "name": "Lab A", "location": "Block A" }
```

### GET /api/v1/admin/computers
Returns all computers with subnet validity, active session, and lab profile.

### GET /api/v1/admin/computers/pending
Returns all PENDING registration computers.

### POST /api/v1/admin/computers/approve `[ADMIN]`
```json
Request:  { "computerId", "pcNumber", "labId", "deviceName", "deviceGroup", "fallbackEnabled" }
```

### PUT /api/v1/admin/computers/:id/status `[ADMIN|SUPERVISOR]`
```json
Request:  { "status": "MAINTENANCE" }
```
Valid statuses: `PENDING | APPROVED | ACTIVE | MAINTENANCE | BLOCKED | RETIRED`

### POST /api/v1/admin/computers/remote-lock
```json
Request:  { "computerId": "uuid" }
```

### POST /api/v1/admin/computers/remote-lock-all
Locks all APPROVED/ACTIVE workstations and terminates active sessions.

### POST /api/v1/admin/computers/remote-end-all
Ends all active student sessions with attendance finalization.

### GET /api/v1/admin/sessions/active
Returns all currently ACTIVE sessions.

### GET /api/v1/admin/reports/attendance
Returns all attendance records with user, session, computer, and lab data.

### GET /api/v1/admin/logs/security
Returns all security alerts ordered by time descending.

### PUT /api/v1/admin/logs/security/:id/resolve `[ADMIN|SUPERVISOR]`
Marks a security alert as resolved.

### POST /api/v1/admin/reports/start-practical
```json
Request:  { "subjectId": "uuid", "labId": "uuid" }
```

### POST /api/v1/admin/reports/end-practical
```json
Request:  { "subjectId": "uuid", "labId": "uuid" }
```

### GET /api/v1/admin/analytics/pilot
Returns pilot KPI metrics: login success rate, latency averages, hourly distribution.

---

## Client API (Workstation)

### GET /api/v1/client/qr-token?computerId=[uuid]
Generates a signed 60-second QR JWT token for the workstation.

### POST /api/v1/client/verify-session-pin
```json
Request:  { "computerId": "uuid", "oneTimePin": "123456" }
Response: { "success": true, "enrollmentNumber", "sessionId" }
```

### POST /api/v1/client/fallback-auth
```json
Request:  { "enrollmentNumber", "pin", "computerId" }
Response: { "message": "Workstation unlocked", "user": {...}, "sessionId" }
```

### POST /api/v1/client/logout
```json
Request:  { "computerId", "sessionId" }
Response: { "message": "Logout registered successfully" }
```

### POST /api/v1/client/watchdog-heartbeat
```json
Request:  { "computerId": "uuid" }
Response: { "status": "success", "lastSeen": "ISO datetime" }
```

### POST /api/v1/client/watchdog-alert
```json
Request:  { "computerId", "alertType", "details", "severity" }
```

### POST /api/v1/client/failed-login
```json
Request:  { "computerId", "enrollmentAttempt", "method" }
```

---

## Mobile API `[JWT]`

### POST /api/v1/mobile/verify-unlock
```json
Request:  { "qrToken": "QR-JWT" }
Response: { "pin": "928471", "expiresIn": 60, "classInfo": {...} | null }
```

---

## Student Portal API `[JWT + STUDENT]`

### GET /api/v1/student/attendance
Returns own attendance summary and full session history.
```json
{
  "summary": {
    "totalSessions": 10,
    "presentCount": 7,
    "partialCount": 2,
    "absentCount": 1,
    "attendancePercentage": 80,
    "totalPracticalHours": 9.5
  },
  "records": [...]
}
```

---

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `register` | `{ macAddress, deviceName, ipAddress, fingerprint, ...hwSpecs }` | Initial registration |
| `heartbeat` | `{ status: "locked" \| "in_use" }` | Periodic status report |
| `logout_complete` | `{}` | Confirm logout completed |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `registered` | `{ computerId, pcNumber, qrSeed, fallbackEnabled, deviceName }` | Registration confirmed |
| `pending_approval` | `{ computerId, fingerprint, deviceName }` | Awaiting admin approval |
| `config_profile` | `{ qrLifetime, heartbeatInterval, offlinePinEnabled }` | Lab profile settings |
| `unlock` | `{ enrollmentNumber }` | Unlock workstation |
| `lock` | `{}` | Force lock workstation |
| `heartbeat_ack` | `{ timestamp }` | Heartbeat acknowledged |
| `error` | `{ message }` | Error notification |
