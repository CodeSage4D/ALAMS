# ALAMS Quality Assurance Checklists

This document outlines the standard testing workflows for the Aurxon Lab Access Management System (ALAMS) pilot.

---

## 1. Smoke Test Checklist (Verify after every installation)

*   [ ] **Server Up**
    *   Verify that `http://localhost:5000/health` responds with `{"status":"healthy"}`
*   [ ] **Database Connected**
    *   Verify that `http://localhost:5000/api/v1/health/diagnostics` responds with `dbConnected: true`
*   [ ] **Web Console Running**
    *   Verify that dashboard login portal loads at `http://localhost:3000`
*   [ ] **Client Registered**
    *   WPF screen displays QR code block containing current token.
*   [ ] **Watchdog Active**
    *   Watchdog service status shows `Running`.

---

## 2. Regression Test Checklist (Verify after code/build updates)

### Authentication Flows
*   [ ] **Sign Up / Login**
    *   Admin user logs in using seeded credentials (`ADMIN01` / `Admin@ALAMS2026!`).
*   [ ] **Student QR Access**
    *   Verify that student scans the screen QR token and receives a valid 6-digit session PIN.
*   [ ] **Session PIN Login**
    *   Entering the PIN unlocks the workstation shell, hides WPF, starts Explorer, and spawns the Session Widget.
*   [ ] **Resilient Local Fallback**
    *   Disable Server API, verify that student login is successful using cached enrollment number and local fallback PIN (`123456`).

### Security Enforcement
*   [ ] **Watchdog Bypass Detection**
    *   While workstation is locked, start `explorer.exe` manually. Verify that the watchdog service detects bypass, logs off the user, and sends a critical alert to the server.
*   [ ] **Task Manager / Windows Keys**
    *   Verify task manager and Windows key combinations are disabled during restricted shell execution.
*   [ ] **Concurrent Login Prevention**
    *   Student with an active session attempts login on another PC. Server must reject and log `CONCURRENT_LOGIN_REJECT`.

---

## 3. User Acceptance Test (UAT) Checklist (Pilot verification)

*   [ ] **Workstation Autodiscovery & Pairing**
    *   Workstation runs bootstrap wizard. Server automatically registers it as `PENDING`.
*   [ ] **One-Time Administrator Approval**
    *   Admin logs in, approves the pending computer, assigns Lab A and a seat number. Workstation instantly transitions to locked screen state.
*   [ ] **Timetable Matching & Attendance**
    *   Student logs in during an active class. Verify that an attendance record is created automatically (status `PRESENT` or `LATE` if after 15 minutes).
*   [ ] **Session Widget Expiry**
    *   Verify that the session countdown is matching profile limits and automatically logs out / locks workstation at session limit.
*   [ ] **Workstation Recovery**
    *   Admin triggers remote lock or remote unlock from Web console. Workstation instantly responds.
