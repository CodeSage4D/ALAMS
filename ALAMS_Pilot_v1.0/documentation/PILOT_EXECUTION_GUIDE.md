# ALAMS Pilot Execution Guide

This document describes the operational roadmap for deploying the **ALAMS (Aurxon Lab Access Management System)** on five physical laboratory computers for a pilot test.

---

## 1. Scope of the Pilot

*   **Target Location**: Block A — Room 102 (SUAS Lab A).
*   **Target workstations**: PC-01 through PC-05.
*   **Target cohort**: Semester 3 Computer Science (Batch B1).
*   **Seeded subject**: Data Structures & Algorithms (CS-301).
*   **Duration**: 1 to 2 academic weeks.

---

## 2. Workstation Mappings

Ensure each of the five workstations is physically labeled and matches its digital profile:

| Seat Number | Hostname | MAC Address | IP Address | Dynamic QR Seed |
| :--- | :--- | :--- | :--- | :--- |
| **PC-01** | `SUAS-LABA-PC01` | `00:1A:2B:3C:4D:11` | `127.0.0.1` (test) | `suas-laba-pc01-seed-2026-pilot` |
| **PC-02** | `SUAS-LABA-PC02` | `00:1A:2B:3C:4D:12` | `10.0.3.102` | `suas-laba-pc02-seed-2026-pilot` |
| **PC-03** | `SUAS-LABA-PC03` | `00:1A:2B:3C:4D:13` | `10.0.3.103` | `suas-laba-pc03-seed-2026-pilot` |
| **PC-04** | `SUAS-LABA-PC04` | `00:1A:2B:3C:4D:14` | `10.0.3.104` | `suas-laba-pc04-seed-2026-pilot` |
| **PC-05** | `SUAS-LABA-PC05` | `00:1A:2B:3C:4D:15` | `10.0.3.105` | `suas-laba-pc05-seed-2026-pilot` |

---

## 3. Daily Execution Workflow

### A. Pre-Class Setup (Supervisor Actions)
1.  Verify the ALAMS API server is running (`start_server.bat` is active).
2.  Boot all five workstation computers. They should boot directly into the locked student shell and display the dynamic QR code indicator.
3.  Check that the network connectivity indicator on all screens shows **ONLINE** (Green).

### B. In-Class Attendance (Student & Faculty Actions)
1.  Students occupy seats PC-01 through PC-05.
2.  Students scan the QR code using their mobile phones, log into the student portal, obtain the 6-digit verification PIN, and enter it to unlock the workstation.
3.  The supervisor monitors the real-time layout grid on the dashboard (`http://[server-ip]:3000/active-sessions`) to confirm that all 5 workstations map correctly to the active students.
4.  If a student is late by more than 15 minutes, the system flags their check-in as `LATE`.

### C. Post-Class Logoff (Student Actions)
1.  Upon completing practical coursework, students click **Log Out** on the floating desktop widget.
2.  Workstations terminate the explorer desktop, log check-out timestamps, and return to the locked screen state.
3.  Faculty supervisors check the **Attendance Report** page to review total hours logged and submit the attendance registry.

---

## 4. Collecting Operational Feedback

To prepare for general release (v1.1), deployers should interview students and faculty on:
*   **QR latency**: Did the QR code generate and scan within 5 seconds?
*   **Bypass security**: Did any student manage to close the lockscreen without triggering a logoff? (Check **Security Alerts** logs).
*   **Offline performance**: Did the workstation fallback PIN function reliably when network lag occurred?
*   **UI Clarity**: Was the floating logout widget easily visible during coding tasks?
