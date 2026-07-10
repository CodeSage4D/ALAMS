import { Response } from "express";
import prisma from "../prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { unlockComputer, lockComputer, sendApprovalToClient, sendRemoteCommand, sendProfileConfigToConnectedClients } from "../websocket";
import { AttendanceStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

export function isIpInSubnet(ip: string, cidr: string): boolean {
  try {
    const [subnetIp, maskStr] = cidr.split("/");
    const mask = parseInt(maskStr, 10);
    
    const ipNum = ipToLong(ip);
    const subnetNum = ipToLong(subnetIp);
    
    if (ipNum === 0 || subnetNum === 0) return false;
    
    const maskLong = mask === 0 ? 0 : (~0 << (32 - mask));
    
    return (ipNum & maskLong) === (subnetNum & maskLong);
  } catch {
    return false;
  }
}

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return 0;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export async function createAuditLog(action: string, details: string, userId?: string, computerId?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        details,
        userId: userId || null,
        computerId: computerId || null,
      },
    });
  } catch (err) {
    console.error("Failed to create immutable audit log:", err);
  }
}

// --- LAB MANAGEMENT ---
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

// --- COMPUTER MANAGEMENT ---
export async function getComputers(req: AuthenticatedRequest, res: Response) {
  try {
    const computers = await prisma.computer.findMany({
      include: {
        lab: { include: { profile: true } },
        sessions: {
          where: { status: "ACTIVE" },
          include: { user: { select: { fullName: true, enrollmentNumber: true } } },
          take: 1
        }
      },
      orderBy: { deviceName: "asc" },
    });

    const computersWithSubnet = computers.map(c => {
      let subnetValid = true;
      let subnetWarning = null;

      if (c.lab && c.lab.subnet && c.ipAddress) {
        subnetValid = isIpInSubnet(c.ipAddress, c.lab.subnet);
        if (!subnetValid) {
          subnetWarning = `IP address ${c.ipAddress} is not in lab subnet ${c.lab.subnet}`;
        }
      }

      return {
        ...c,
        subnetValid,
        subnetWarning
      };
    });

    return res.json(computersWithSubnet);
  } catch (err: any) {
    console.error("getComputers error:", err);
    return res.status(500).json({ error: "Failed to retrieve computers" });
  }
}

export async function createComputer(req: AuthenticatedRequest, res: Response) {
  const { labId, pcNumber, deviceName, ipAddress, macAddress, fallbackEnabled } = req.body;
  if (!labId || !pcNumber || !deviceName || !ipAddress || !macAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const qrSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const computer = await prisma.computer.create({
      data: {
        labId,
        pcNumber,
        deviceName,
        ipAddress,
        macAddress,
        qrSeed,
        fallbackEnabled: fallbackEnabled !== undefined ? fallbackEnabled : true,
        status: "APPROVED",
      },
    });
    return res.status(201).json(computer);
  } catch (err: any) {
    return res.status(400).json({ error: "MAC Address or Device Name already registered" });
  }
}

export async function toggleFallback(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { fallbackEnabled } = req.body;

  try {
    const computer = await prisma.computer.update({
      where: { id },
      data: { fallbackEnabled },
    });
    return res.json(computer);
  } catch (err: any) {
    return res.status(404).json({ error: "Computer not found" });
  }
}

export async function remoteUnlock(req: AuthenticatedRequest, res: Response) {
  const { computerId } = req.body;
  const adminId = req.user?.userId;

  if (!computerId) return res.status(400).json({ error: "Computer ID required" });

  try {
    const computer = await prisma.computer.findUnique({ where: { id: computerId } });
    if (!computer) return res.status(404).json({ error: "Computer not found" });

    // Mark current session completed if exists
    await prisma.session.updateMany({
      where: { computerId, status: "ACTIVE" },
      data: { status: "TERMINATED", logoutTime: new Date() },
    });

    // Create bypass session
    const session = await prisma.session.create({
      data: {
        userId: adminId!, // Admin account
        computerId,
        verificationMethod: "ADMIN_OVERRIDE",
        status: "ACTIVE",
      },
    });

    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "ACTIVE" },
    });

    const success = unlockComputer(computerId, "ADMIN_OVERRIDE");
    if (!success) {
      return res.status(504).json({ error: "Workstation WebSocket is unreachable. Unlock failed." });
    }

    return res.json({ message: "Remote bypass command sent to PC successfully", sessionId: session.id });
  } catch (err: any) {
    console.error("Remote unlock error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function remoteLock(req: AuthenticatedRequest, res: Response) {
  const { computerId } = req.body;

  if (!computerId) return res.status(400).json({ error: "Computer ID required" });

  try {
    const computer = await prisma.computer.findUnique({ where: { id: computerId } });
    if (!computer) return res.status(404).json({ error: "Computer not found" });

    // Terminate any active sessions
    await prisma.session.updateMany({
      where: { computerId, status: "ACTIVE" },
      data: { status: "TERMINATED", logoutTime: new Date() },
    });

    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "APPROVED" },
    });

    lockComputer(computerId);

    return res.json({ message: "Remote lock command sent successfully" });
  } catch (err: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- STUDENT/USER MANAGEMENT ---
export async function getStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        enrollmentNumber: true,
        fullName: true,
        email: true,
        semester: true,
        department: true,
        section: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { enrollmentNumber: "asc" },
    });
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load students" });
  }
}

export async function toggleStudentStatus(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { isActive } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, enrollmentNumber: true, isActive: true },
    });
    return res.json(user);
  } catch (err: any) {
    return res.status(404).json({ error: "Student not found" });
  }
}

// --- REPORTS AND LOGS ---
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

export async function getActiveSessions(req: AuthenticatedRequest, res: Response) {
  try {
    const activeSessions = await prisma.session.findMany({
      where: { status: "ACTIVE" },
      include: {
        user: { select: { fullName: true, enrollmentNumber: true } },
        computer: { select: { pcNumber: true, deviceName: true, lab: { select: { name: true } } } },
      },
      orderBy: { loginTime: "desc" },
    });
    return res.json(activeSessions);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch active sessions" });
  }
}

export async function getSecurityAlerts(req: AuthenticatedRequest, res: Response) {
  try {
    const alerts = await prisma.securityAlert.findMany({
      include: {
        computer: { select: { pcNumber: true, deviceName: true } },
        session: { include: { user: { select: { enrollmentNumber: true } } } },
      },
      orderBy: { alertTime: "desc" },
    });
    return res.json(alerts);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve security logs" });
  }
}

export async function resolveAlert(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const alert = await prisma.securityAlert.update({
      where: { id },
      data: { resolved: true },
    });
    return res.json(alert);
  } catch (err: any) {
    return res.status(404).json({ error: "Alert not found" });
  }
}

export async function getPendingComputers(req: AuthenticatedRequest, res: Response) {
  try {
    const pending = await prisma.computer.findMany({
      where: { status: "PENDING" },
      orderBy: { lastSeen: "desc" },
    });
    return res.json(pending);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve pending computers" });
  }
}

export async function approveComputer(req: AuthenticatedRequest, res: Response) {
  const { computerId, pcNumber, labId, deviceName, deviceGroup, fallbackEnabled } = req.body;

  if (!computerId || !pcNumber || !labId) {
    return res.status(400).json({ error: "Computer ID, PC Number, and Lab ID required for approval" });
  }

  try {
    const computerExists = await prisma.computer.findUnique({
      where: { id: computerId },
    });

    if (!computerExists) {
      return res.status(404).json({ error: "Computer not found" });
    }

    // Generate secure QR seed
    const qrSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const updatedComputer = await prisma.computer.update({
      where: { id: computerId },
      data: {
        pcNumber,
        labId,
        qrSeed,
        status: "APPROVED",
        deviceName: deviceName || computerExists.deviceName,
        deviceGroup: deviceGroup || "Workstation",
        fallbackEnabled: fallbackEnabled !== undefined ? fallbackEnabled : true,
      },
    });

    // Notify connected client UI of registration success via WS
    sendApprovalToClient(
      updatedComputer.id,
      updatedComputer.pcNumber,
      updatedComputer.qrSeed,
      updatedComputer.fallbackEnabled,
      updatedComputer.deviceName
    );

    await createAuditLog(
      "DEVICE_APPROVED",
      `Computer ${updatedComputer.deviceName} approved and mapped to PC number ${updatedComputer.pcNumber}`,
      req.user?.userId,
      updatedComputer.id
    );

    return res.json({
      message: "Computer paired successfully",
      computer: updatedComputer,
    });
  } catch (err: any) {
    console.error("Approve PC error:", err);
    return res.status(500).json({ error: "Failed to pair workstation" });
  }
}

export async function updateComputerStatus(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const pc = await prisma.computer.update({
      where: { id },
      data: { status },
    });
    await createAuditLog("DEVICE_STATUS_UPDATE", `Updated computer ${pc.deviceName} status to ${status}`, req.user?.userId, pc.id);
    return res.json(pc);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update status" });
  }
}

export async function lockAllWorkstations(req: AuthenticatedRequest, res: Response) {
  try {
    const computers = await prisma.computer.findMany({
      where: { status: { in: ["APPROVED", "ACTIVE"] } }
    });
    let count = 0;
    for (const pc of computers) {
      const success = lockComputer(pc.id);
      if (success) {
        count++;
        await prisma.session.updateMany({
          where: { computerId: pc.id, status: "ACTIVE" },
          data: { status: "TERMINATED", logoutTime: new Date() }
        });
        await prisma.computer.update({
          where: { id: pc.id },
          data: { status: "APPROVED" }
        });
      }
    }
    await createAuditLog("FACULTY_LOCK_ALL", `Faculty Lock All command executed. Broadcasted to ${count} computers.`, req.user?.userId);
    return res.json({ message: `Successfully sent lock command to ${count} workstations.` });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to lock all workstations" });
  }
}

export async function endAllSessions(req: AuthenticatedRequest, res: Response) {
  try {
    const activeSessions = await prisma.session.findMany({
      where: { status: "ACTIVE" }
    });
    let count = 0;
    for (const session of activeSessions) {
      lockComputer(session.computerId);
      
      const logoutTime = new Date();
      const durationMinutes = Math.round((logoutTime.getTime() - session.loginTime.getTime()) / 60000);
      
      await prisma.session.update({
        where: { id: session.id },
        data: { status: "COMPLETED", logoutTime, durationMinutes }
      });

      const attendance = await prisma.attendance.findFirst({
        where: { sessionId: session.id }
      });
      if (attendance) {
        let newStatus: AttendanceStatus = AttendanceStatus.PRESENT;
        if (durationMinutes < 15) {
          newStatus = AttendanceStatus.ABSENT;
        } else if (durationMinutes < 45) {
          newStatus = AttendanceStatus.PARTIAL;
        } else if (attendance.status === AttendanceStatus.LATE) {
          newStatus = AttendanceStatus.LATE;
        }

        await prisma.attendance.update({
          where: { id: attendance.id },
          data: {
            checkOut: logoutTime,
            status: newStatus,
            duration: durationMinutes,
            practicalHours: parseFloat((durationMinutes / 60.0).toFixed(1))
          }
        });
      }

      await prisma.computer.update({
        where: { id: session.computerId },
        data: { status: "APPROVED" }
      });
      count++;
    }
    await createAuditLog("FACULTY_END_ALL", `Faculty End All Sessions executed. Terminated ${count} student sessions.`, req.user?.userId);
    return res.json({ message: `Successfully terminated ${count} sessions.` });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to terminate sessions" });
  }
}

export async function startPractical(req: AuthenticatedRequest, res: Response) {
  const { subjectId, labId } = req.body;
  try {
    await createAuditLog("PRACTICAL_STARTED", `Faculty started practical. Subject ID: ${subjectId}, Lab ID: ${labId}`, req.user?.userId);
    return res.json({ message: "Practical class started successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to start practical" });
  }
}

export async function endPractical(req: AuthenticatedRequest, res: Response) {
  const { subjectId, labId } = req.body;
  try {
    await createAuditLog("PRACTICAL_ENDED", `Faculty ended practical. Subject ID: ${subjectId}, Lab ID: ${labId}`, req.user?.userId);
    return res.json({ message: "Practical class ended successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to end practical" });
  }
}

export async function getDiagnostics(req: AuthenticatedRequest, res: Response) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const labCount = await prisma.lab.count();
    const computerCount = await prisma.computer.count();
    const profileCount = await prisma.profile.count();
    const subjectCount = await prisma.subject.count();

    const labs = await prisma.lab.findMany({ select: { id: true, name: true, subnet: true } });
    const subnetIssues = [];
    for (const lab of labs) {
      if (!lab.subnet) {
        subnetIssues.push(`Lab "${lab.name}" is missing subnet configuration profile.`);
      } else {
        const parts = lab.subnet.split("/");
        if (parts.length !== 2 || isNaN(parseInt(parts[1], 10))) {
          subnetIssues.push(`Lab "${lab.name}" has invalid subnet mask format: "${lab.subnet}". Expected CIDR (e.g. 10.0.3.0/24).`);
        }
      }
    }

    return res.json({
      status: "healthy",
      timestamp: Date.now(),
      dbConnected: true,
      metrics: {
        labs: labCount,
        computers: computerCount,
        profiles: profileCount,
        subjects: subjectCount,
      },
      subnetStatus: subnetIssues.length === 0 ? "VALID" : "WARNINGS",
      warnings: subnetIssues,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: "unhealthy",
      dbConnected: false,
      error: err.message || "Database connection failure",
    });
  }
}

export async function queueRemoteCommand(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { command, parameters } = req.body;

  if (!command) {
    return res.status(400).json({ error: "Command action is required" });
  }

  try {
    const computer = await prisma.computer.findUnique({ where: { id } });
    if (!computer) {
      return res.status(404).json({ error: "Workstation not found" });
    }

    const cmd = await prisma.commandQueue.create({
      data: {
        computerId: id,
        command,
        parameters: parameters ? JSON.stringify(parameters) : null,
        status: "PENDING",
      },
    });

    const sent = sendRemoteCommand(id, cmd.id, command, parameters ? JSON.stringify(parameters) : undefined);

    if (sent) {
      await prisma.commandQueue.update({
        where: { id: cmd.id },
        data: { status: "SENT" },
      });
    }

    await createAuditLog(
      "REMOTE_COMMAND_QUEUED",
      `Admin queued remote command ${command} on workstation ${computer.deviceName}. Dispatch status: ${sent ? "SENT" : "QUEUED"}`,
      req.user?.userId,
      id
    );

    return res.json({
      success: true,
      message: sent ? "Command sent to workstation successfully" : "Workstation is offline. Command queued for execution upon reconnection.",
      commandId: cmd.id,
      status: sent ? "SENT" : "PENDING",
    });
  } catch (err: any) {
    console.error("queueRemoteCommand error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createGpoPolicy(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { key, valueName, valueType, value } = req.body;

  if (!key || !valueName || !value) {
    return res.status(400).json({ error: "key, valueName, and value are required" });
  }

  try {
    const profile = await prisma.profile.findUnique({ where: { id } });
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const policy = await prisma.gpoPolicy.create({
      data: {
        profileId: id,
        key,
        valueName,
        valueType: valueType || "DWORD",
        value,
      },
    });

    await createAuditLog(
      "GPO_POLICY_CREATED",
      `GPO Policy ${valueName} created for profile ${profile.name}`,
      req.user?.userId
    );

    return res.status(201).json(policy);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create GPO policy" });
  }
}

export async function getGpoPolicies(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const policies = await prisma.gpoPolicy.findMany({
      where: { profileId: id },
      orderBy: { createdAt: "desc" },
    });
    return res.json(policies);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve GPO policies" });
  }
}

export async function deleteGpoPolicy(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const policy = await prisma.gpoPolicy.delete({ where: { id } });
    await createAuditLog(
      "GPO_POLICY_DELETED",
      `GPO Policy ${policy.valueName} deleted from profile ${policy.profileId}`,
      req.user?.userId
    );
    return res.json({ message: "GPO policy deleted successfully" });
  } catch (err: any) {
    return res.status(404).json({ error: "GPO policy not found" });
  }
}

// Helper to hash password/PIN
async function hashValue(value: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}

// Bulk import students
export async function importStudents(req: AuthenticatedRequest, res: Response) {
  const studentsList = req.body;

  if (!Array.isArray(studentsList)) {
    return res.status(400).json({ error: "Expected an array of student objects" });
  }

  try {
    let createdCount = 0;
    let skippedCount = 0;
    const defaultPinHash = await hashValue("123456");

    for (const student of studentsList) {
      const { enrollmentNumber, fullName, email, semester, department, section } = student;
      if (!enrollmentNumber || !fullName) {
        skippedCount++;
        continue;
      }

      // Check if user exists
      const existing = await prisma.user.findUnique({
        where: { enrollmentNumber }
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // Generate secure temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      const passwordHash = await hashValue(tempPassword);

      await prisma.user.create({
        data: {
          enrollmentNumber,
          fullName,
          email: email || null,
          semester: semester || null,
          department: department || null,
          section: section || null,
          passwordHash,
          pinHash: defaultPinHash,
          role: "STUDENT",
          mustChangePassword: true,
          isActive: true
        }
      });

      student.tempPassword = tempPassword;
      student.status = "CREATED";
      createdCount++;
    }

    await createAuditLog(
      "STUDENT_BULK_IMPORT",
      `Bulk imported ${createdCount} student profiles. Skipped/Existing: ${skippedCount}`,
      req.user?.userId
    );

    return res.json({
      message: `Successfully imported ${createdCount} students. Skipped ${skippedCount} existing or invalid records.`,
      importedStudents: studentsList
    });
  } catch (err: any) {
    console.error("Bulk import failed:", err);
    return res.status(500).json({ error: err.message || "Bulk student import failed" });
  }
}

// Reset student password
export async function adminResetStudentPassword(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  try {
    const student = await prisma.user.findFirst({
      where: { id, role: "STUDENT" }
    });

    if (!student) {
      return res.status(404).json({ error: "Student profile not found" });
    }

    // Generate secure temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const newPasswordHash = await hashValue(tempPassword);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
      }
    });

    await createAuditLog(
      "STUDENT_PASSWORD_RESET",
      `Admin reset password for student ${student.fullName} (${student.enrollmentNumber}).`,
      req.user?.userId
    );

    return res.json({
      message: "Password reset successfully",
      enrollmentNumber: student.enrollmentNumber,
      fullName: student.fullName,
      tempPassword
    });
  } catch (err: any) {
    console.error("Admin student password reset failed:", err);
    return res.status(500).json({ error: err.message || "Failed to reset student password" });
  }
}

// Force shutdown all workstations
export async function shutdownAllWorkstations(req: AuthenticatedRequest, res: Response) {
  try {
    const computers = await prisma.computer.findMany({
      where: { status: { in: ["APPROVED", "ACTIVE"] } }
    });
    let count = 0;
    for (const pc of computers) {
      const cmd = await prisma.commandQueue.create({
        data: {
          computerId: pc.id,
          command: "SHUTDOWN",
          status: "PENDING",
        },
      });

      const sent = sendRemoteCommand(pc.id, cmd.id, "SHUTDOWN");
      if (sent) {
        count++;
        await prisma.commandQueue.update({
          where: { id: cmd.id },
          data: { status: "SENT" },
        });

        // Terminate any active sessions on the machine
        await prisma.session.updateMany({
          where: { computerId: pc.id, status: "ACTIVE" },
          data: { status: "TERMINATED", logoutTime: new Date() }
        });

        // Set computer status back to approved (unlocked state closed)
        await prisma.computer.update({
          where: { id: pc.id },
          data: { status: "APPROVED" }
        });
      }
    }

    await createAuditLog(
      "ADMIN_SHUTDOWN_ALL",
      `Admin initiated force shutdown command on all workstations. Target connected count: ${count}`,
      req.user?.userId
    );

    return res.json({ message: `Sent shutdown command to ${count} connected workstations.` });
  } catch (err: any) {
    console.error("Force shutdown all workstations failed:", err);
    return res.status(500).json({ error: err.message || "Failed to shut down workstations" });
  }
}

// Update profile authentication configuration (QR / PIN toggles)
export async function updateProfileAuthConfig(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { offlinePinEnabled, qrAuthEnabled } = req.body;

  try {
    const profile = await prisma.profile.update({
      where: { id },
      data: {
        offlinePinEnabled: offlinePinEnabled !== undefined ? offlinePinEnabled : undefined,
        qrAuthEnabled: qrAuthEnabled !== undefined ? qrAuthEnabled : undefined
      }
    });

    await createAuditLog(
      "PROFILE_CONFIG_UPDATED",
      `Admin updated profile ${profile.name} authentication configurations: QR: ${profile.qrAuthEnabled ? "ON" : "OFF"}, PIN: ${profile.offlinePinEnabled ? "ON" : "OFF"}`,
      req.user?.userId
    );

    // Broadcast updated configurations to all connected client computers
    await sendProfileConfigToConnectedClients(profile.id);

    return res.json(profile);
  } catch (err: any) {
    return res.status(404).json({ error: "Profile not found" });
  }
}

