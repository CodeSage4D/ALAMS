import { Request, Response } from "express";
import prisma from "../prisma";
import { generateQRToken, verifyQRToken, compareValue } from "../utils/crypto";
import { unlockComputer } from "../websocket";
import { AuthenticatedRequest } from "../middleware/auth";

export async function getQRToken(req: Request, res: Response) {
  const { computerId } = req.query;

  if (!computerId || typeof computerId !== "string") {
    return res.status(400).json({ error: "Computer ID required" });
  }

  try {
    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
    });

    if (!computer) {
      return res.status(404).json({ error: "Computer not registered" });
    }

    const token = generateQRToken({
      computerId: computer.id,
      deviceName: computer.deviceName,
      labId: computer.labId,
      pcNumber: computer.pcNumber,
      timestamp: Date.now(),
    });

    return res.json({ token });
  } catch (err: any) {
    console.error("Error generating QR token:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

import { AttendanceStatus } from "@prisma/client";

export async function verifyMobileUnlock(req: AuthenticatedRequest, res: Response) {
  const { qrToken } = req.body;
  const user = req.user;

  if (!qrToken) {
    return res.status(400).json({ error: "QR token required" });
  }

  if (!user) {
    return res.status(401).json({ error: "Student session invalid" });
  }

  try {
    // 1. Verify dynamic QR token
    let payload;
    try {
      payload = verifyQRToken(qrToken);
    } catch (e: any) {
      return res.status(400).json({ error: "QR Code expired or invalid. Please scan again." });
    }

    const { computerId } = payload;

    // 2. Fetch computer
    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
    });

    if (!computer) {
      return res.status(404).json({ error: "Workstation not registered" });
    }

    // 3. Ensure student does not have another active session elsewhere
    const activeStudentSession = await prisma.session.findFirst({
      where: {
        userId: user.userId,
        status: "ACTIVE",
      },
    });

    if (activeStudentSession) {
      // Log failed double-login attempt
      await prisma.auditLog.create({
        data: {
          action: "CONCURRENT_LOGIN_REJECT",
          userId: user.userId,
          computerId,
          details: `Rejected login for student ${user.enrollmentNumber} because they have an active session on workstation ID ${activeStudentSession.computerId}`,
        },
      });

      return res.status(400).json({
        error: "Active session already detected on another workstation.",
      });
    }

    // 4. Determine active timetable slot
    const now = new Date();
    const currentDay = now.getDay();
    const currentHours = String(now.getHours()).padStart(2, "0");
    const currentMinutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;

    const slot = await prisma.timetableSlot.findFirst({
      where: {
        labId: computer.labId,
        dayOfWeek: currentDay,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
      include: {
        subject: true,
        faculty: true,
      },
    });

    let late = false;
    if (slot) {
      const [startH, startM] = slot.startTime.split(":").map(Number);
      const classStartDate = new Date(now);
      classStartDate.setHours(startH, startM, 0, 0);
      const diffMinutes = (now.getTime() - classStartDate.getTime()) / 60000;
      late = diffMinutes > 15;
    }

    // 5. Generate 60-second session PIN
    const oneTimePin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpiresAt = new Date(Date.now() + 60000);

    // Create session in PENDING state
    const verifyTimestamp = Date.now();
    const latencyMs = typeof payload.timestamp === "number" ? verifyTimestamp - payload.timestamp : null;

    const session = await prisma.session.create({
      data: {
        userId: user.userId,
        computerId: computer.id,
        verificationMethod: "QR_CODE",
        status: "PENDING",
        unlockLatencyMs: latencyMs ?? undefined,
        oneTimePin,
        pinExpiresAt,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      },
    });

    return res.json({
      message: "One-Time Session PIN generated successfully",
      pin: oneTimePin,
      expiresIn: 60,
      classInfo: slot ? {
        subjectName: slot.subject.name,
        subjectCode: slot.subject.code,
        facultyName: slot.faculty.fullName,
        semester: slot.semester,
        branch: slot.branch,
        section: slot.section,
        batch: slot.batch,
        late,
      } : null,
    });
  } catch (err: any) {
    console.error("Mobile unlock error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function verifySessionPIN(req: Request, res: Response) {
  const { computerId, oneTimePin } = req.body;

  if (!computerId || !oneTimePin) {
    return res.status(400).json({ error: "Computer ID and PIN required" });
  }

  try {
    // Find pending session
    const session = await prisma.session.findFirst({
      where: {
        computerId,
        oneTimePin,
        status: "PENDING",
      },
      include: {
        user: { select: { id: true, enrollmentNumber: true } },
        computer: true,
      },
    });

    if (!session) {
      await prisma.securityAlert.create({
        data: {
          computerId,
          alertType: "failed_pin_verification",
          alertSeverity: "WARNING",
          details: `Failed session PIN "${oneTimePin}" validation attempt.`,
        },
      });
      return res.status(401).json({ error: "Invalid PIN code." });
    }

    if (session.pinExpiresAt && new Date() > session.pinExpiresAt) {
      return res.status(401).json({ error: "PIN code has expired. Please scan QR again." });
    }

    // Activate session
    const loginTime = new Date();
    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: "ACTIVE",
        oneTimePin: null,
        pinExpiresAt: null,
        loginTime,
      },
    });

    let isLate = false;
    if (session.timetableSlotId) {
      const slot = await prisma.timetableSlot.findUnique({
        where: { id: session.timetableSlotId }
      });
      if (slot) {
        const [startH, startM] = slot.startTime.split(":").map(Number);
        const classStartDate = new Date(loginTime);
        classStartDate.setHours(startH, startM, 0, 0);
        const diffMinutes = (loginTime.getTime() - classStartDate.getTime()) / 60000;
        isLate = diffMinutes > 15;
      }
    }

    // Create attendance
    await prisma.attendance.create({
      data: {
        userId: session.userId,
        sessionId: session.id,
        status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        checkIn: loginTime,
        subjectId: session.subjectId,
        facultyId: session.facultyId,
      },
    });

    // Update PC to ACTIVE
    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "ACTIVE" },
    });

    // Send WS unlock to client
    unlockComputer(computerId, session.user.enrollmentNumber);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "STUDENT_LOGIN",
        userId: session.userId,
        computerId,
        details: `Student ${session.user.enrollmentNumber} successfully completed 2FA PIN unlock on workstation ${session.computer.deviceName}`,
      },
    });

    return res.json({
      success: true,
      message: "Session authenticated successfully",
      enrollmentNumber: session.user.enrollmentNumber,
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error("verifySessionPIN error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function verifyLocalPINAuth(req: Request, res: Response) {
  const { enrollmentNumber, pin, computerId } = req.body;

  if (!enrollmentNumber || !pin || !computerId) {
    return res.status(400).json({ error: "Enrollment Number, PIN, and Computer ID are required" });
  }

  // Format validations
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const studentRegex = /^ENR[a-zA-Z0-9]+$/i;
  if (!emailRegex.test(enrollmentNumber) && !studentRegex.test(enrollmentNumber)) {
    return res.status(400).json({ error: "Invalid Enrollment Number format" });
  }

  const pinRegex = /^\d{6}$/;
  if (!pinRegex.test(pin)) {
    return res.status(400).json({ error: "PIN must be exactly a 6-digit numeric code" });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(computerId)) {
    return res.status(400).json({ error: "Invalid Computer ID format" });
  }

  try {
    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
    });

    if (!computer) {
      return res.status(404).json({ error: "Computer not registered" });
    }

    if (!computer.fallbackEnabled) {
      return res.status(403).json({ error: "PIN fallback authentication is disabled for this computer" });
    }

    const user = await prisma.user.findUnique({
      where: { enrollmentNumber },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid enrollment or inactive account" });
    }

    const isPinValid = await compareValue(pin, user.pinHash);

    if (!isPinValid) {
      return res.status(401).json({ error: "Invalid PIN" });
    }

    // Ensure student does not have another active session elsewhere
    const activeStudentSession = await prisma.session.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
    });

    if (activeStudentSession) {
      await prisma.auditLog.create({
        data: {
          action: "CONCURRENT_LOGIN_REJECT",
          userId: user.id,
          computerId,
          details: `Rejected fallback login for student ${user.enrollmentNumber} because they have an active session on workstation ID ${activeStudentSession.computerId}`,
        },
      });
      return res.status(400).json({
        error: "Active session already detected on another workstation.",
      });
    }

    // Determine active timetable slot
    const now = new Date();
    const currentDay = now.getDay();
    const currentHours = String(now.getHours()).padStart(2, "0");
    const currentMinutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;

    const slot = await prisma.timetableSlot.findFirst({
      where: {
        labId: computer.labId,
        dayOfWeek: currentDay,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
    });

    let late = false;
    if (slot) {
      const [startH, startM] = slot.startTime.split(":").map(Number);
      const classStartDate = new Date(now);
      classStartDate.setHours(startH, startM, 0, 0);
      const diffMinutes = (now.getTime() - classStartDate.getTime()) / 60000;
      late = diffMinutes > 15;
    }

    // Create Session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        computerId: computer.id,
        verificationMethod: "PIN_FALLBACK",
        status: "ACTIVE",
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      },
    });

    // Create Attendance
    await prisma.attendance.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        status: late ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        checkIn: now,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
      },
    });

    // Update PC
    await prisma.computer.update({
      where: { id: computer.id },
      data: { status: "ACTIVE" },
    });

    unlockComputer(computer.id, user.enrollmentNumber);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "STUDENT_LOGIN_FALLBACK",
        userId: user.id,
        computerId,
        details: `Student ${user.enrollmentNumber} unlocked workstation ${computer.deviceName} via local fallback PIN`,
      },
    });

    return res.json({
      message: "Workstation unlocked successfully",
      user: {
        fullName: user.fullName,
        enrollmentNumber: user.enrollmentNumber,
      },
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error("Local PIN auth error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function clientLogout(req: Request, res: Response) {
  const { computerId, sessionId } = req.body;

  if (!computerId || !sessionId) {
    return res.status(400).json({ error: "Computer ID and Session ID required" });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { enrollmentNumber: true } } },
    });

    if (!session || session.status !== "ACTIVE") {
      return res.status(404).json({ error: "Active session not found" });
    }

    const logoutTime = new Date();
    const durationMinutes = Math.round((logoutTime.getTime() - session.loginTime.getTime()) / 60000);

    // Update Session
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        logoutTime,
        durationMinutes,
      },
    });

    // Update Attendance status according to active duration thresholds
    const attendance = await prisma.attendance.findFirst({
      where: { sessionId },
    });
    if (attendance) {
      let finalStatus: AttendanceStatus = AttendanceStatus.PRESENT;
      if (durationMinutes < 15) {
        finalStatus = AttendanceStatus.ABSENT; // Marked absent for insufficient duration
      } else if (durationMinutes < 45) {
        finalStatus = AttendanceStatus.PARTIAL;
      } else if (attendance.status === AttendanceStatus.LATE) {
        finalStatus = AttendanceStatus.LATE;
      }

      await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOut: logoutTime,
          status: finalStatus,
          duration: durationMinutes,
          practicalHours: parseFloat((durationMinutes / 60.0).toFixed(1)),
        },
      });
    }

    // Reset PC to APPROVED
    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "APPROVED" },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "STUDENT_LOGOUT",
        userId: session.userId,
        computerId,
        details: `Student ${session.user.enrollmentNumber} logged out. Duration: ${durationMinutes} mins. Attendance: ${attendance ? attendance.status : "N/A"}`,
      },
    });

    return res.json({ message: "Logout registered successfully" });
  } catch (err: any) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function watchdogHeartbeat(req: Request, res: Response) {
  const { computerId } = req.body;

  if (!computerId) {
    return res.status(400).json({ error: "Computer ID required" });
  }

  try {
    const pc = await prisma.computer.update({
      where: { id: computerId },
      data: { watchdogHeartbeat: new Date() },
    });

    return res.json({ status: "success", lastSeen: pc.watchdogHeartbeat });
  } catch (err: any) {
    return res.status(404).json({ error: "Computer not found" });
  }
}

export async function watchdogAlert(req: Request, res: Response) {
  const { computerId, alertType, details, severity } = req.body;

  if (!computerId || !alertType) {
    return res.status(400).json({ error: "Computer ID and Alert Type are required" });
  }

  try {
    // Log security alert in DB
    const alert = await prisma.securityAlert.create({
      data: {
        computerId,
        alertType,
        alertSeverity: severity || "CRITICAL",
        details: details || "Watchdog generated security log alert",
      },
    });

    // Also update target computer status to APPROVED if it was terminated
    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "APPROVED" },
    });

    // Mark active session as completed/terminated
    await prisma.session.updateMany({
      where: { computerId, status: "ACTIVE" },
      data: { status: "TERMINATED", logoutTime: new Date() },
    });

    return res.json({ status: "success", alertId: alert.id });
  } catch (err: any) {
    console.error("Watchdog alert API error:", err);
    return res.status(500).json({ error: "Failed to record security alert" });
  }
}

// ── Student Portal API ─────────────────────────────────────────────────────
export async function getStudentAttendance(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const attendanceRecords = await prisma.attendance.findMany({
      where: { userId },
      include: {
        subject: { select: { name: true, code: true } },
        faculty: { select: { fullName: true } },
        session: {
          include: {
            computer: {
              select: {
                pcNumber: true,
                deviceName: true,
                lab: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { checkIn: "desc" },
    });

    const totalSessions = attendanceRecords.length;
    const presentCount = attendanceRecords.filter(a =>
      ["PRESENT", "LATE"].includes(a.status)
    ).length;
    const partialCount = attendanceRecords.filter(a => a.status === "PARTIAL").length;
    const absentCount = attendanceRecords.filter(a => a.status === "ABSENT").length;
    const totalPracticalHours = attendanceRecords.reduce(
      (sum, a) => sum + (a.practicalHours ?? 0), 0
    );
    const attendancePercentage =
      totalSessions === 0
        ? 0
        : Math.round(((presentCount + partialCount * 0.5) / totalSessions) * 100);

    return res.json({
      summary: {
        totalSessions,
        presentCount,
        partialCount,
        absentCount,
        attendancePercentage,
        totalPracticalHours: parseFloat(totalPracticalHours.toFixed(1)),
      },
      records: attendanceRecords,
    });
  } catch (err: any) {
    console.error("getStudentAttendance error:", err);
    return res.status(500).json({ error: "Failed to load attendance records" });
  }
}
