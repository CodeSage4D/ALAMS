# ALAMS Pilot Setup Guide

## Pilot Environment Specification

| Parameter | Value |
|-----------|-------|
| Workstations | 5 (SUAS-LABA-PC01 to PC05) |
| Lab | SUAS Lab A — Block A, Room 102 |
| Subnet | 127.0.0.0/8 (local test) / 10.0.3.0/24 (production) |
| Faculty | Dr. Faculty Member |
| Students | ENR2026001 – ENR2026010 |
| Subject | CS-301: Data Structures & Algorithms |
| Timetable | Monday–Sunday 08:00–21:00 (wide window for pilot testing) |

---

## Pilot Credentials

> **CONFIDENTIAL — Do not share outside the deployment team.**

### Administrators
| Account | Role | Login | Password | PIN |
|---------|------|-------|----------|-----|
| Karan Mishra | ADMIN | karan.mishra@suas.ac.in | Pilot@2026! | 112233 |
| Nitin Panchal | ADMIN | nitin.panchal@suas.ac.in | Pilot@2026! | 112233 |
| Prashant Patil | ADMIN | prashant.patil@suas.ac.in | Pilot@2026! | 112233 |
| Monark Riakwar | SUPERVISOR | monark.riakwar@suas.ac.in | Pilot@2026! | 112233 |
| Dr. Faculty Member | FACULTY | faculty.member@suas.ac.in | Pilot@2026! | 112233 |

### Students
| Enrollment | Name | Password | PIN |
|------------|------|----------|-----|
| ENR2026001 | Arjun Sharma | Student@2026! | 123456 |
| ENR2026002 | Priya Mehta | Student@2026! | 123456 |
| ENR2026003 | Rohan Verma | Student@2026! | 123456 |
| ENR2026004 | Sneha Patel | Student@2026! | 123456 |
| ENR2026005 | Karan Singh | Student@2026! | 123456 |
| ENR2026006 | Ananya Nair | Student@2026! | 123456 |
| ENR2026007 | Devraj Gupta | Student@2026! | 123456 |
| ENR2026008 | Meera Rao | Student@2026! | 123456 |
| ENR2026009 | Vikram Joshi | Student@2026! | 123456 |
| ENR2026010 | Tanvi Desai | Student@2026! | 123456 |

---

## Pre-Pilot Checklist

- [ ] Server running at `http://[server-ip]:5000`
- [ ] Web Console accessible at `http://[server-ip]:3000`
- [ ] All 5 workstations powered on and running `AlamsClient.exe`
- [ ] All 5 workstations show status `APPROVED` in Admin Dashboard
- [ ] Database seeded successfully (verify via diagnostics endpoint)
- [ ] Faculty account logged into web console
- [ ] Test QR scan from student mobile device
- [ ] Test PIN entry on workstation
- [ ] Test logout via Session Widget
- [ ] Verify attendance created in Admin Dashboard > Faculty Attendance

---

## Pilot Day Procedure

### Morning Setup (IT Administrator)
1. Start server: `node dist/index.js` or `npm run dev`
2. Start web console: `npm start` (port 3000)
3. Open Admin Dashboard — verify all workstations show APPROVED
4. Check Security Alerts — clear any overnight false positives

### Student Session Flow
1. Student sits at workstation — lock screen displayed
2. Student opens `http://[server-ip]:3000/login` on mobile
3. Login with enrollment number + password
4. Tap "Scan QR Code" → Scan workstation QR
5. PIN appears on mobile screen (valid 60 seconds)
6. Enter PIN on workstation lock screen
7. Workstation unlocks — Explorer launches
8. Session Widget appears (floating, draggable)
9. At end of session: click "Logout" in Session Widget
10. Lock screen reactivates

### Faculty Session Control
1. Log into `http://[server-ip]:3000/admin/login`
2. Navigate to **Live Monitor** tab
3. Use **Faculty Command Deck** to:
   - Start Practical (logs audit event)
   - End Practical (logs audit event)
   - Lock All PCs (emergency)
   - End All Sessions (force logout with attendance finalization)

---

## Post-Pilot Data Export

1. Admin Dashboard → Faculty Attendance → Export CSV Report
2. Admin Dashboard → Session Audits → review session history
3. Admin Dashboard → Security Alerts → review flagged events
4. Admin Dashboard → Pilot Analytics → screenshot KPI metrics

---

## Seed Refresh (Reset for Next Test)

```powershell
cd server
npx ts-node prisma/seed.ts
```

This clears all data and re-seeds fresh pilot accounts and demo sessions.
