# ALAMS Troubleshooting Guide

## Server Issues

### Server won't start
```
Error: Cannot find module '@prisma/client'
```
**Fix**: Run `npx prisma generate` in the `server/` directory.

### Database connection fails
```
Error: Can't reach database server
```
**Fix**:
1. Check `DATABASE_URL` in `.env` is correct
2. Verify Neon project is active (free tier may pause after inactivity)
3. Run `npx prisma db push` to test connectivity

### JWT errors on API calls
```
{ "error": "Invalid or expired token" }
```
**Fix**: Token has expired (8h TTL). User must log in again. In dev, increase `expiresIn` temporarily.

---

## Workstation Client Issues

### Client shows "OFFLINE MODE" immediately
**Cause**: Cannot reach server WebSocket.
**Fix**:
1. Verify server is running: `curl http://[server]:5000/health`
2. Check `C:\ProgramData\ALAMS\config.json` has correct `serverUrl`
3. Check Windows Firewall allows port 5000 inbound on server machine
4. Verify server and client are on the same network

### Client stuck on "PENDING REGISTRATION"
**Cause**: Workstation registered but not yet approved by admin.
**Fix**: Log into Admin Dashboard → Asset Inventory → Find pending workstation → Click Approve.

### QR code not loading
**Cause**: `api.qrserver.com` unreachable (internet required) or computerId is empty.
**Fix**:
1. Ensure internet access is available on the client machine
2. If air-gapped, self-host a QR code generator endpoint and update `QrTimer_Tick` in `MainWindow.xaml.cs`
3. Check that `_computerId` is populated (workstation must be APPROVED)

### PIN verification fails with "Invalid PIN"
**Cause**: PIN expired (60s TTL) or PIN already used.
**Fix**:
1. Student must scan QR code again to generate a new PIN
2. PIN cannot be reused — each QR scan creates a new session

### WMI queries return "N/A"
**Cause**: Application not running with sufficient Windows privileges.
**Fix**: Right-click `AlamsClient.exe` → Run as Administrator, or configure manifest to request `requireAdministrator` level.

---

## Web Console Issues

### Admin dashboard shows blank / 401 errors
**Cause**: Admin token expired or not saved.
**Fix**: Navigate to `/admin/login` and log in again.

### Student portal shows "Failed to load attendance data"
**Cause**: `student_token` in localStorage expired or invalid.
**Fix**: Navigate to `/login` and re-authenticate.

### Computers show "Offline" despite being on
**Cause**: WebSocket connection dropped.
**Fix**:
1. Restart `AlamsClient.exe` on the affected workstation
2. WebSocket will auto-reconnect on startup

### Subnet warning badge showing on all computers
**Cause**: Lab subnet is set to `127.0.0.0/8` (loopback test config).
**Fix**: In Admin Dashboard, update the Lab subnet to match your actual LAN subnet (e.g., `10.0.3.0/24`).

---

## Attendance Issues

### Attendance not created after unlock
**Cause**: No active timetable slot matched the current time.
**Effect**: Session is created but attendance has no subject/faculty link.
**Fix**: Ensure TimetableSlot records exist for the current lab, day, and time range. Use the seed script to verify.

### Attendance status shows ABSENT after logout
**Cause**: Student logged out within 15 minutes of logging in.
**Expected behavior**: Sessions under 15 minutes are marked ABSENT (minimum participation threshold).

### Late detection not working
**Cause**: TimetableSlot startTime format incorrect.
**Fix**: Ensure `startTime` and `endTime` are in `HH:MM` 24-hour format (e.g., `08:00`, `17:30`).

---

## Database Issues

### Seed fails with unique constraint violation
**Cause**: Previous seed data exists.
**Fix**: Seed script clears all data first. If it fails mid-run, manually clear with:
```sql
TRUNCATE users, labs, computers, sessions, attendance CASCADE;
```

### Prisma migration errors
```
Error: There are X uncommitted changes
```
**Fix**: Run `npx prisma migrate dev --name fix` or `npx prisma db push --force-reset` (destructive).

---

## Performance Issues

### High login latency (>5s)
**Cause**: Neon PostgreSQL cold start (free tier wakes after inactivity).
**Fix**: 
1. Upgrade to Neon paid tier for always-on compute
2. Implement a startup ping to warm the DB connection on server start

### WebSocket messages slow
**Cause**: Large number of concurrent connections.
**Fix**: For >20 concurrent workstations, move to a dedicated server (not developer laptop).
