import { Request, Response } from "express";
import { forceDatabaseSync } from "./dbSyncService";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- FORCE DUAL-DATABASE SYNC ---
export async function forceSync(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await forceDatabaseSync();
    return res.json(result);
  } catch (err: any) {
    console.error("Force sync failed:", err);
    return res.status(500).json({ error: err.message || "Failed to trigger dual database replication" });
  }
}
