import { Request, Response } from "express";
import prisma from "../prisma";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- BASIC UNAUTHENTICATED HEALTH CHECK ---
export async function getHealth(req: Request, res: Response) {
  try {
    const activeClientsCount = await prisma.computer.count({ where: { status: "APPROVED" } });
    const activeSessionsCount = await prisma.session.count({ where: { status: "ACTIVE" } });
    return res.json({
      status: "healthy",
      timestamp: Date.now(),
      activeClients: activeClientsCount,
      activeSessions: activeSessionsCount,
      dbStatus: "CONNECTED"
    });
  } catch (err: any) {
    return res.json({
      status: "unhealthy",
      timestamp: Date.now(),
      activeClients: 0,
      activeSessions: 0,
      dbStatus: "DISCONNECTED",
      error: err.message
    });
  }
}

// --- DETAILED AUTHENTICATED SYSTEM DIAGNOSTICS ---
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
