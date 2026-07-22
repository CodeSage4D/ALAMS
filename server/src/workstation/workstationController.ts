import { Request, Response } from "express";
import prisma from "../prisma";
import { 
  unlockComputer, 
  lockComputer, 
  sendApprovalToClient, 
  sendRemoteCommand, 
  sendProfileConfigToConnectedClients, 
  disconnectClient 
} from "../websocket";
import { generateQRToken } from "../auth/passwordHelper";
import { createAuditLog } from "../monitoring/logger";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- HELPER METHODS FOR SUBNET MATCHING ---
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

// --- GET REGISTERED COMPUTERS (Dashboard List) ---
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

// --- MANUALLY REGISTER COMPUTER ---
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

// --- UPDATE COMPUTER PROFILE ---
export async function updateComputer(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { deviceName, pcNumber, seatNumber, labId, deviceGroup, department, fallbackEnabled, status, seatNotes } = req.body;

  try {
    const existing = await prisma.computer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Computer not found" });
    }

    const oldName = existing.deviceName;
    const oldStatus = existing.status;

    const updated = await prisma.computer.update({
      where: { id },
      data: {
        deviceName: deviceName !== undefined ? deviceName : undefined,
        pcNumber: pcNumber !== undefined ? pcNumber : undefined,
        seatNumber: seatNumber !== undefined ? seatNumber : undefined,
        labId: labId !== undefined ? labId : undefined,
        deviceGroup: deviceGroup !== undefined ? deviceGroup : undefined,
        department: department !== undefined ? department : undefined,
        fallbackEnabled: fallbackEnabled !== undefined ? fallbackEnabled : undefined,
        status: status !== undefined ? status : undefined,
        seatNotes: seatNotes !== undefined ? seatNotes : undefined,
      }
    });

    if (deviceName && deviceName !== oldName) {
      const cmd = await prisma.commandQueue.create({
        data: {
          computerId: id,
          command: "RENAME_COMPUTER",
          parameters: deviceName,
          status: "PENDING"
        }
      });
      const sent = sendRemoteCommand(id, cmd.id, "RENAME_COMPUTER", deviceName);
      if (sent) {
        await prisma.commandQueue.update({
          where: { id: cmd.id },
          data: { status: "SENT" }
        });
      }
    }

    if (status && status !== oldStatus && (status === "BLOCKED" || status === "RETIRED")) {
      disconnectClient(id);
    }

    await createAuditLog(
      "DEVICE_CONFIG_UPDATED",
      `Admin updated details for computer ${updated.deviceName}. Status: ${updated.status}`,
      req.user?.userId,
      id
    );

    return res.json(updated);
  } catch (err: any) {
    console.error("updateComputer error:", err);
    return res.status(500).json({ error: "Failed to update workstation client details" });
  }
}

// --- DELETE COMPUTER REGISTER ---
export async function deleteComputer(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  try {
    const computer = await prisma.computer.findUnique({ where: { id } });
    if (!computer) {
      return res.status(404).json({ error: "Computer not found" });
    }

    disconnectClient(id);

    await prisma.commandQueue.deleteMany({ where: { computerId: id } });
    await prisma.securityAlert.deleteMany({ where: { computerId: id } });
    
    const sessions = await prisma.session.findMany({ where: { computerId: id } });
    const sessionIds = sessions.map(s => s.id);
    await prisma.attendance.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.session.deleteMany({ where: { computerId: id } });

    await prisma.computer.delete({ where: { id } });

    await createAuditLog(
      "DEVICE_REMOVED",
      `Admin deleted workstation client ${computer.deviceName} (MAC: ${computer.macAddress}) from system.`,
      req.user?.userId
    );

    return res.json({ message: "Workstation deleted successfully" });
  } catch (err: any) {
    console.error("deleteComputer error:", err);
    return res.status(500).json({ error: "Failed to remove workstation client" });
  }
}

// --- GET COMPUTER WORKSTATION HISTORY LOGS ---
export async function getComputerHistory(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  try {
    const computer = await prisma.computer.findUnique({ where: { id } });
    if (!computer) {
      return res.status(404).json({ error: "Computer not found" });
    }

    const sessions = await prisma.session.findMany({
      where: { computerId: id },
      include: {
        user: { select: { fullName: true, enrollmentNumber: true } },
        attendance: true,
      },
      orderBy: { loginTime: "desc" },
    });

    const alerts = await prisma.securityAlert.findMany({
      where: { computerId: id },
      orderBy: { alertTime: "desc" },
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: { computerId: id },
      orderBy: { createdAt: "desc" },
    });

    const authAudits = await prisma.authAudit.findMany({
      where: { computerId: id },
      orderBy: { loginTime: "desc" },
    });

    return res.json({
      computer,
      sessions,
      alerts,
      auditLogs,
      authAudits,
    });
  } catch (err: any) {
    console.error("getComputerHistory error:", err);
    return res.status(500).json({ error: "Failed to query workstation client history logs" });
  }
}

// --- TOGGLE LOCAL AUTH BYPASS (FALLBACK) ---
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

// --- GET PENDING AUTO-DISCOVERED WORKSTATIONS ---
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

// --- APPROVE AND PAIR PENDING WORKSTATION ---
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

// --- UPDATE COMPUTER STATUS FIELD DIRECTLY ---
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

// --- ENROLL NEW CLIENT (AUTO DISCOVERY ENDPOINT CALL) ---
export async function enrollClient(req: Request, res: Response) {
  const specs = req.body;
  if (!specs.macAddress || !specs.deviceName) {
    return res.status(400).json({ error: "MAC Address and Device Name required" });
  }

  try {
    let computer = await prisma.computer.findUnique({
      where: { macAddress: specs.macAddress }
    });

    if (computer) {
      computer = await prisma.computer.update({
        where: { id: computer.id },
        data: {
          ipAddress: specs.ipAddress || computer.ipAddress,
          deviceName: specs.deviceName || computer.deviceName,
          fingerprint: specs.fingerprint || computer.fingerprint,
          installedVersion: specs.clientVersion || computer.installedVersion
        }
      });
      
      return res.json({
        computerId: computer.id,
        status: computer.status,
        message: "Computer already enrolled. Telemetry registry mapped."
      });
    }

    let defaultLab = await prisma.lab.findFirst();
    if (!defaultLab) {
      defaultLab = await prisma.lab.create({
        data: {
          name: "SUAS Default Lab",
          location: "Building A",
          floor: "1st Floor"
        }
      });
    }

    const labComputers = await prisma.computer.findMany({
      where: { labId: defaultLab.id }
    });
    let maxPc = 0;
    labComputers.forEach(pc => {
      const num = parseInt(pc.pcNumber.replace(/\D/g, ""));
      if (!isNaN(num) && num > maxPc) {
        maxPc = num;
      }
    });
    const nextPcNumber = `PC-${String(maxPc + 1).padStart(2, "0")}`;

    computer = await prisma.computer.create({
      data: {
        labId: defaultLab.id,
        pcNumber: nextPcNumber,
        deviceName: specs.deviceName,
        ipAddress: specs.ipAddress || "127.0.0.1",
        macAddress: specs.macAddress,
        fingerprint: specs.fingerprint || null,
        qrSeed: Math.random().toString(36).substring(2, 10).toUpperCase(),
        status: "PENDING",
        trustStatus: "TRUSTED"
      }
    });

    return res.json({
      computerId: computer.id,
      status: "PENDING",
      message: "Computer discovered. Status set to PENDING pairing verification."
    });
  } catch (err: any) {
    console.error("enrollClient error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- DISPATCH TELEMETRY SYSTEM PERFORMANCE ---
export async function dispatchTelemetry(req: Request, res: Response) {
  const { computerId, cpuUsage, ramUsage, loggedStudent, policyStatus, installedVersion } = req.body;

  if (!computerId) {
    return res.status(400).json({ error: "Computer ID required" });
  }

  try {
    const pc = await prisma.computer.update({
      where: { id: computerId },
      data: {
        cpuUsage: cpuUsage !== undefined ? parseFloat(cpuUsage) : null,
        ramUsage: ramUsage !== undefined ? parseFloat(ramUsage) : null,
        loggedStudent: loggedStudent || null,
        policyStatus: policyStatus || null,
        installedVersion: installedVersion || null,
        lastTelemetry: new Date(),
      },
    });

    return res.json({ status: "success", lastTelemetry: pc.lastTelemetry });
  } catch (err: any) {
    return res.status(404).json({ error: "Computer not found" });
  }
}

// --- DYNAMIC QR SEED RETRIEVER (WPF CLIENT CALL) ---
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

// --- REMOTE ACTIONS MATRIX ---

export async function remoteUnlock(req: AuthenticatedRequest, res: Response) {
  const { computerId } = req.body;
  const reqAdminId = req.user?.userId;

  if (!computerId) return res.status(400).json({ error: "Computer ID required" });

  try {
    const computer = await prisma.computer.findUnique({ where: { id: computerId } });
    if (!computer) return res.status(404).json({ error: "Computer not found" });

    let adminUser = reqAdminId ? await prisma.user.findUnique({ where: { id: reqAdminId } }) : null;
    if (!adminUser) {
      adminUser = await prisma.user.findFirst({
        where: { role: { in: ["ADMIN", "SUPERVISOR", "FACULTY"] } }
      });
    }

    if (!adminUser) {
      return res.status(400).json({ error: "No system administrators found" });
    }

    await prisma.session.updateMany({
      where: { computerId, status: "ACTIVE" },
      data: { status: "TERMINATED", logoutTime: new Date() },
    });

    const session = await prisma.session.create({
      data: {
        userId: adminUser.id,
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
    await createAuditLog("REMOTE_BYPASS_UNLOCK", `Bypass unlock executed on computer ${computer.deviceName} (PC #${computer.pcNumber})`, adminUser.id, computerId);

    return res.json({
      message: success ? "Remote bypass unlock command dispatched successfully" : "Bypass session recorded. Signal queued.",
      sessionId: session.id,
      unlocked: true
    });
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
      message: sent ? "Command sent successfully" : "Workstation is offline. Command queued.",
      commandId: cmd.id,
      status: sent ? "SENT" : "PENDING",
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to queue command" });
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
        let newStatus: any = "PRESENT";
        if (durationMinutes < 15) {
          newStatus = "ABSENT";
        } else if (durationMinutes < 45) {
          newStatus = "PARTIAL";
        } else if (attendance.status === "LATE") {
          newStatus = "LATE";
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

    await createAuditLog(
      "ADMIN_SHUTDOWN_ALL",
      `Admin initiated force shutdown command on all workstations. Target connected count: ${count}`,
      req.user?.userId
    );

    return res.json({ message: `Sent shutdown command to ${count} connected workstations.` });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to shut down workstations" });
  }
}

// --- PROFILE CONFIGURATION ---

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
      `Admin updated profile ${profile.name} auth configurations: QR: ${profile.qrAuthEnabled ? "ON" : "OFF"}, PIN: ${profile.offlinePinEnabled ? "ON" : "OFF"}`,
      req.user?.userId
    );

    await sendProfileConfigToConnectedClients(profile.id);

    return res.json(profile);
  } catch (err: any) {
    return res.status(404).json({ error: "Profile not found" });
  }
}

// --- GPO POLICY MANAGEMENT ---
export async function createGpoPolicy(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params; // profileId
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

    await sendProfileConfigToConnectedClients(id);

    return res.status(201).json(policy);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create GPO policy" });
  }
}

export async function getGpoPolicies(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params; // profileId
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
  const { id } = req.params; // policyId
  try {
    const policy = await prisma.gpoPolicy.delete({ where: { id } });
    await createAuditLog(
      "GPO_POLICY_DELETED",
      `GPO Policy ${policy.valueName} deleted from profile ${policy.profileId}`,
      req.user?.userId
    );
    await sendProfileConfigToConnectedClients(policy.profileId);
    return res.json({ message: "GPO policy deleted successfully" });
  } catch (err: any) {
    return res.status(404).json({ error: "GPO policy not found" });
  }
}
