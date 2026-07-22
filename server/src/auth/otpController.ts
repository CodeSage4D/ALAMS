import { Request, Response } from "express";
import prisma from "../prisma";
import { EmailGateway } from "./emailGateway";
import { unlockComputer } from "../websocket";
import bcrypt from "bcryptjs";
import { AttendanceStatus, VerificationMethod } from "@prisma/client";

// Request OTP endpoint
export async function requestOTP(req: Request, res: Response) {
  const { enrollmentNumber, computerId } = req.body;

  if (!enrollmentNumber || !computerId) {
    return res.status(400).json({ error: "Enrollment Number/Email and Computer ID are required" });
  }

  try {
    // 1. Validate student record
    const student = await prisma.user.findFirst({
      where: {
        OR: [
          { enrollmentNumber: enrollmentNumber },
          { email: enrollmentNumber }
        ],
        role: "STUDENT"
      }
    });

    if (!student || !student.isActive) {
      return res.status(404).json({ error: "Student record not found or inactive." });
    }

    // 2. Validate workstation presence
    const computer = await prisma.computer.findUnique({
      where: { id: computerId }
    });

    if (!computer) {
      return res.status(404).json({ error: "Workstation not registered." });
    }

    // 3. Enforce Rate Limit: max 3 requests in 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentRequestsCount = await prisma.otpVerification.count({
      where: {
        enrollmentNumber: student.enrollmentNumber,
        generatedTime: { gte: tenMinutesAgo }
      }
    });

    if (recentRequestsCount >= 3) {
      return res.status(429).json({ error: "Maximum OTP request limit reached. Please wait 10 minutes." });
    }

    // 4. Invalidate previous pending OTPs
    await prisma.otpVerification.updateMany({
      where: {
        enrollmentNumber: student.enrollmentNumber,
        status: "PENDING"
      },
      data: { status: "EXPIRED" }
    });

    // 5. Generate secure 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiryTime = new Date(Date.now() + 60 * 1000); // 60 seconds

    // 6. Store in database
    await prisma.otpVerification.create({
      data: {
        studentId: student.id,
        enrollmentNumber: student.enrollmentNumber,
        email: student.email || `${student.enrollmentNumber}@suas.ac.in`,
        otpHash,
        expiryTime,
        status: "PENDING",
        workstationId: computer.id,
        clientIp: computer.ipAddress || null,
        macAddress: computer.macAddress || null
      }
    });

    // 7. Queue email delivery
    await EmailGateway.enqueueEmail(
      student.email || `${student.enrollmentNumber}@suas.ac.in`,
      "OTP_VERIFICATION",
      {
        studentName: student.fullName,
        enrollmentNumber: student.enrollmentNumber,
        workstationName: computer.pcNumber,
        loginTime: new Date().toLocaleTimeString(),
        otpCode: otpCode
      }
    );

    // 8. Record audit log
    await prisma.auditLog.create({
      data: {
        action: "OTP_GENERATED",
        userId: student.id,
        computerId: computer.id,
        details: `Generated secure verification OTP for student ${student.enrollmentNumber} on PC ${computer.deviceName}`
      }
    });

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err: any) {
    console.error("Request OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Verify OTP and Unlock Workstation endpoint
export async function verifyOTP(req: Request, res: Response) {
  const { enrollmentNumber, otp, computerId } = req.body;

  if (!enrollmentNumber || !otp || !computerId) {
    return res.status(400).json({ error: "Enrollment, OTP, and Workstation ID are required" });
  }

  try {
    // 1. Fetch student
    const student = await prisma.user.findFirst({
      where: {
        OR: [
          { enrollmentNumber: enrollmentNumber },
          { email: enrollmentNumber }
        ],
        role: "STUDENT"
      }
    });

    if (!student || !student.isActive) {
      return res.status(404).json({ error: "Student record not found." });
    }

    // 2. Fetch latest PENDING OTP record
    const otpRecord = await prisma.otpVerification.findFirst({
      where: {
        enrollmentNumber: student.enrollmentNumber,
        status: "PENDING"
      },
      orderBy: { generatedTime: "desc" }
    });

    if (!otpRecord) {
      return res.status(401).json({ error: "No pending verification code found. Please request a new OTP." });
    }

    // 3. Check locked status (max 3 retries)
    if (otpRecord.retryCount >= 3) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { status: "LOCKED" }
      });
      return res.status(401).json({ error: "Verification locked due to too many failed attempts. Request a new OTP." });
    }

    // 4. Validate duplicate active sessions
    const activeSession = await prisma.session.findFirst({
      where: {
        userId: student.id,
        status: "ACTIVE"
      }
    });

    if (activeSession) {
      return res.status(400).json({ error: "Active session already detected on another workstation." });
    }

    // 5. Check Expiration (60s lifetime)
    if (new Date() > otpRecord.expiryTime) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { status: "EXPIRED" }
      });
      return res.status(401).json({ error: "Verification code has expired. Please request a new OTP." });
    }

    // 6. Verify password/OTP hash match
    const isMatch = await bcrypt.compare(otp, otpRecord.otpHash);

    if (!isMatch) {
      const updatedRetry = otpRecord.retryCount + 1;
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: {
          retryCount: updatedRetry,
          status: updatedRetry >= 3 ? "LOCKED" : "PENDING"
        }
      });

      await prisma.auditLog.create({
        data: {
          action: "OTP_VERIFY_FAIL",
          userId: student.id,
          computerId,
          details: `Failed OTP validation attempt for student ${student.enrollmentNumber} (Attempt ${updatedRetry}/3)`
        }
      });

      return res.status(401).json({ error: "Invalid verification code." });
    }

    // 7. Successful OTP verification - Invalidate OTP immediately
    await prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { status: "VERIFIED", verificationTime: new Date() }
    });

    const computer = await prisma.computer.findUnique({
      where: { id: computerId }
    });

    if (!computer) {
      return res.status(404).json({ error: "Computer not registered." });
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

    // Create session record
    const session = await prisma.session.create({
      data: {
        userId: student.id,
        computerId: computer.id,
        verificationMethod: VerificationMethod.EMAIL_OTP,
        status: "ACTIVE",
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      }
    });

    // Create attendance record
    await prisma.attendance.create({
      data: {
        userId: student.id,
        sessionId: session.id,
        status: late ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        checkIn: now,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
      }
    });

    // Update PC status to active
    await prisma.computer.update({
      where: { id: computer.id },
      data: { status: "ACTIVE" }
    });

    // Unlock Workstation Client
    unlockComputer(computer.id, student.enrollmentNumber);

    // Save session ID on verification record
    await prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { sessionId: session.id }
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "STUDENT_LOGIN_OTP",
        userId: student.id,
        computerId: computer.id,
        details: `Student ${student.enrollmentNumber} successfully authenticated via Email OTP on workstation ${computer.deviceName}`
      }
    });

    return res.json({
      success: true,
      message: "Workstation unlocked successfully",
      sessionId: session.id,
      user: {
        fullName: student.fullName,
        enrollmentNumber: student.enrollmentNumber
      }
    });
  } catch (err: any) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
