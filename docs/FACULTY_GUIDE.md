# ALAMS Faculty & Lab Supervisor Guide

This document describes how lab instructors and faculty members use the **ALAMS (Aurxon Lab Access Management System)** to coordinate student sessions, record attendance, and monitor workspaces.

---

## 1. Faculty Dashboard Login

Instructors can log in from any browser in the lab:
*   **Web Address**: `http://[server-ip]:3000`
*   **Seeded Faculty Account**:
    *   **Account ID**: `faculty.member@suas.ac.in`
    *   **Password**: `Pilot@2026!`
    *   **PIN**: `334455`

---

## 2. Timetable & Session Matching

ALAMS matches student sessions to active timetable slots:
*   Sessions are mapped automatically based on the lab subnet, current time, and scheduled subject.
*   **Late Policy**: If a student unlocks their workstation more than 15 minutes after the class start time, their attendance status is automatically flagged as **LATE**.
*   **Attendance Logging**: On checkout, the system aggregates session durations and records student attendance.

---

## 3. Real-Time Lab Layout Monitor

The **Active Sessions** tab renders a grid representing physical seat positions:
*   **Green Workstation**: Active student session (displays student's name and enrollment number).
*   **Red Workstation**: Locked screen, currently unpaired or offline.
*   **Orange Workstation**: Pending workstation requiring administrator pairing.

---

## 4. Operational In-Class Controls

If a student needs to change workstations or bypass verification (e.g. they forgot their mobile phone), supervisors can trigger overrides:
*   **Request Temporary Bypass**: Instructors can provide students with a fallback passcode, or use the dashboard to click **Unlock** on that specific workstation.
*   **Manual Attendance Change**: Adjust checking times or statuses for students directly from the **Attendance Log** view.
*   **Class Lock**: Trigger a remote lock command at the end of class to lock all workstations in the room simultaneously.
