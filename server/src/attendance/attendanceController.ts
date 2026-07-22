import { Request, Response } from "express";
import prisma from "../prisma";
import { createAuditLog } from "../monitoring/logger";
import { AttendanceStatus } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- GET LABS REGISTRY ---
export async function getLabs(req: AuthenticatedRequest, res: Response) {
  try {
    const labs = await prisma.lab.findMany({
      include: {
        _count: {
          select: { computers: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return res.json(labs);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve labs" });
  }
}

// --- CREATE LAB ---
export async function createLab(req: AuthenticatedRequest, res: Response) {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: "Lab name is required" });

  try {
    const lab = await prisma.lab.create({
      data: { name, location },
    });
    return res.status(201).json(lab);
  } catch (err: any) {
    return res.status(400).json({ error: "Lab name already exists" });
  }
}

// --- UPDATE LAB DETAILS ---
export async function updateLabDetails(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { name, location, subnet } = req.body;
  try {
    const lab = await prisma.lab.update({
      where: { id },
      data: { name, location, subnet }
    });
    await createAuditLog("LAB_UPDATED", `Updated lab ${lab.name} (${lab.location}, Subnet: ${lab.subnet})`, req.user?.userId);
    return res.json(lab);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update lab details" });
  }
}

// --- GET GLOBAL ATTENDANCE REPORTS (Admin) ---
export async function getAttendance(req: AuthenticatedRequest, res: Response) {
  try {
    const attendance = await prisma.attendance.findMany({
      include: {
        user: { select: { fullName: true, enrollmentNumber: true } },
        session: {
          include: {
            computer: { select: { pcNumber: true, deviceName: true, lab: { select: { name: true } } } },
          },
        },
      },
      orderBy: { checkIn: "desc" },
    });
    return res.json(attendance);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch attendance reports" });
  }
}

// --- GET SINGLE STUDENT ATTENDANCE STATS (Student Portal) ---
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

// --- START PRACTICAL LESSON ---
export async function startPractical(req: AuthenticatedRequest, res: Response) {
  const { subjectId, labId } = req.body;
  try {
    await createAuditLog("PRACTICAL_STARTED", `Faculty started practical. Subject ID: ${subjectId}, Lab ID: ${labId}`, req.user?.userId);
    return res.json({ message: "Practical class started successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to start practical" });
  }
}

// --- END PRACTICAL LESSON ---
export async function endPractical(req: AuthenticatedRequest, res: Response) {
  const { subjectId, labId } = req.body;
  try {
    await createAuditLog("PRACTICAL_ENDED", `Faculty ended practical. Subject ID: ${subjectId}, Lab ID: ${labId}`, req.user?.userId);
    return res.json({ message: "Practical class ended successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to end practical" });
  }
}
