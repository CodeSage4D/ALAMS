import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import path from "path";

// Load configuration
dotenv.config();

import { 
  signup, 
  login, 
  changePassword, 
  requestPasswordReset, 
  resetPassword,
  getStudents,
  createStudent,
  toggleStudentStatus,
  softDeleteStudent,
  restoreStudent,
  purgeTrashStudent,
  bulkPromoteDemoteStudents,
  adminResetStudentPassword,
  bulkGeneratePasswords,
  verifyAdminPIN
} from "./auth/authController";

import {
  getLabs,
  createLab,
  updateLabDetails,
  getAttendance,
  getStudentAttendance,
  startPractical,
  endPractical
} from "./attendance/attendanceController";

import {
  getComputers,
  createComputer,
  updateComputer,
  deleteComputer,
  getComputerHistory,
  toggleFallback,
  getPendingComputers,
  approveComputer,
  updateComputerStatus,
  enrollClient,
  dispatchTelemetry,
  getQRToken,
  remoteUnlock,
  remoteLock,
  queueRemoteCommand,
  lockAllWorkstations,
  endAllSessions,
  shutdownAllWorkstations,
  createGpoPolicy,
  getGpoPolicies,
  deleteGpoPolicy,
  updateProfileAuthConfig
} from "./workstation/workstationController";

import {
  verifySessionPIN,
  verifyMobileUnlock,
  verifyLocalPINAuth,
  clientLogout,
  syncOfflineSession,
  watchdogHeartbeat,
  watchdogAlert,
  getActiveSessions,
  registerAndUnlock,
  getSecurityAlerts,
  resolveAlert
} from "./session/sessionController";

import { getPilotAnalytics, recordFailedLogin } from "./monitoring/analyticsController";
import { getHealth, getDiagnostics } from "./monitoring/healthController";
import { authenticateJWT, authorizeRoles } from "./middleware/auth";
import { initWebSocketServer, requestDiagnosticsFromClient } from "./websocket";
import { startUdpBeacon } from "./workstation/discoveryService";
import prisma, { ensureDefaultLabs } from "./prisma";

import { requestOTP, verifyOTP } from "./auth/otpController";
import { importStudents } from "./import-export/importController";
import { getEmailConfig, updateEmailConfig, testEmailConnection, getEmailDashboardStats } from "./auth/emailConfigController";
import { startBackgroundWorkers } from "./workstation/queueProcessor";

const app = express();
const port = process.env.PORT || 5000;

// CORS — apply strict origin whitelist from environment
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5000")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser tools, whitelisted origins, and private LAN IP ranges
    if (!origin || 
        allowedOrigins.includes(origin) || 
        origin.startsWith("http://localhost:") || 
        origin.startsWith("http://127.0.0.1:") || 
        origin.startsWith("http://192.168.") || 
        origin.startsWith("http://10.") || 
        origin.startsWith("http://172.16.") || 
        origin.startsWith("http://172.17.") || 
        origin.startsWith("http://172.18.") || 
        origin.startsWith("http://172.19.") || 
        origin.startsWith("http://172.20.") || 
        origin.startsWith("http://172.21.") || 
        origin.startsWith("http://172.22.") || 
        origin.startsWith("http://172.23.") || 
        origin.startsWith("http://172.24.") || 
        origin.startsWith("http://172.25.") || 
        origin.startsWith("http://172.26.") || 
        origin.startsWith("http://172.27.") || 
        origin.startsWith("http://172.28.") || 
        origin.startsWith("http://172.29.") || 
        origin.startsWith("http://172.30.") || 
        origin.startsWith("http://172.31.")
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' not permitted`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));

// Trust proxy (for accurate IP behind nginx/reverse proxy in production)
app.set("trust proxy", 1);

// Static downloads directory for Client updates
app.use("/download", express.static(path.join(__dirname, "../../publish")));

// Public API
app.get("/health", getHealth);
app.get("/api/v1/health/diagnostics", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), getDiagnostics);

// Authentication API
app.post("/api/v1/auth/signup", signup);
app.post("/api/v1/auth/login", login);
app.post("/api/v1/auth/change-password", authenticateJWT, changePassword);
app.post("/api/v1/auth/reset-password-request", requestPasswordReset);
app.post("/api/v1/auth/reset-password", resetPassword);

// Admin / Supervisor / Faculty APIs
app.get("/api/v1/admin/students", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getStudents);
app.post("/api/v1/admin/students", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), createStudent);
app.put("/api/v1/admin/students/:id/status", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), toggleStudentStatus);
app.delete("/api/v1/admin/students/:id", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), softDeleteStudent);
app.post("/api/v1/admin/students/:id/restore", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), restoreStudent);
app.delete("/api/v1/admin/students/:id/purge", authenticateJWT, authorizeRoles("ADMIN"), purgeTrashStudent);
app.post("/api/v1/admin/students/bulk-semester", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), bulkPromoteDemoteStudents);
app.post("/api/v1/admin/students/import", authenticateJWT, authorizeRoles("ADMIN"), importStudents);
app.post("/api/v1/admin/students/bulk-generate-passwords", authenticateJWT, authorizeRoles("ADMIN"), bulkGeneratePasswords);
app.post("/api/v1/admin/students/:id/reset-password", authenticateJWT, authorizeRoles("ADMIN"), adminResetStudentPassword);

app.get("/api/v1/admin/labs", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getLabs);
app.post("/api/v1/admin/labs", authenticateJWT, authorizeRoles("ADMIN"), createLab);
app.put("/api/v1/admin/labs/:id", authenticateJWT, authorizeRoles("ADMIN"), updateLabDetails);


app.get("/api/v1/admin/computers", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getComputers);
app.get("/api/v1/admin/computers/pending", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getPendingComputers);
app.post("/api/v1/admin/computers", authenticateJWT, authorizeRoles("ADMIN"), createComputer);
app.post("/api/v1/admin/computers/approve", authenticateJWT, authorizeRoles("ADMIN"), approveComputer);
app.put("/api/v1/admin/computers/:id/status", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), updateComputerStatus);
app.put("/api/v1/admin/computers/:id/fallback", authenticateJWT, authorizeRoles("ADMIN"), toggleFallback);
app.put("/api/v1/admin/computers/:id", authenticateJWT, authorizeRoles("ADMIN"), updateComputer);
app.delete("/api/v1/admin/computers/:id", authenticateJWT, authorizeRoles("ADMIN"), deleteComputer);
app.get("/api/v1/admin/computers/:id/history", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), getComputerHistory);
app.post("/api/v1/admin/computers/remote-unlock", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), remoteUnlock);
app.post("/api/v1/admin/computers/remote-lock", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), remoteLock);
app.post("/api/v1/admin/computers/:id/command", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), queueRemoteCommand);
app.post("/api/v1/admin/computers/remote-lock-all", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), lockAllWorkstations);
app.post("/api/v1/admin/computers/remote-end-all", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), endAllSessions);
app.post("/api/v1/admin/computers/remote-shutdown-all", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), shutdownAllWorkstations);
app.post("/api/v1/admin/profiles/:id/policies", authenticateJWT, authorizeRoles("ADMIN"), createGpoPolicy);
app.get("/api/v1/admin/profiles/:id/policies", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getGpoPolicies);
app.delete("/api/v1/admin/policies/:id", authenticateJWT, authorizeRoles("ADMIN"), deleteGpoPolicy);
app.put("/api/v1/admin/profiles/:id/auth-config", authenticateJWT, authorizeRoles("ADMIN"), updateProfileAuthConfig);
app.get("/api/v1/admin/computers/:id/diagnostics", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), async (req, res) => {
  const { id } = req.params;
  try {
    const diagnostics = await requestDiagnosticsFromClient(id);
    return res.json(diagnostics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to query diagnostics" });
  }
});

app.post("/api/v1/admin/reports/start-practical", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), startPractical);
app.post("/api/v1/admin/reports/end-practical", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), endPractical);

app.get("/api/v1/admin/sessions/active", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getActiveSessions);
app.get("/api/v1/admin/reports/attendance", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getAttendance);
app.get("/api/v1/admin/logs/security", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), getSecurityAlerts);
app.put("/api/v1/admin/logs/security/:id/resolve", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), resolveAlert);

// Client API (Unauthenticated/Token Authenticated)
app.get("/api/v1/client/qr-token", getQRToken);
app.post("/api/v1/client/fallback-auth", verifyLocalPINAuth);
app.post("/api/v1/client/logout", clientLogout);
app.post("/api/v1/client/verify-session-pin", verifySessionPIN);
app.post("/api/v1/client/watchdog-heartbeat", watchdogHeartbeat);
app.post("/api/v1/client/watchdog-alert", watchdogAlert);
app.post("/api/v1/client/telemetry", dispatchTelemetry);
app.post("/api/v1/client/failed-login", recordFailedLogin);
app.post("/api/v1/client/verify-admin-pin", verifyAdminPIN);
app.post("/api/v1/client/enroll", enrollClient);
app.post("/api/v1/client/sync-offline-session", syncOfflineSession);

app.post("/api/v1/client/request-otp", requestOTP);
app.post("/api/v1/client/verify-otp", verifyOTP);

// Email Config APIs
app.get("/api/v1/admin/config/email", authenticateJWT, authorizeRoles("ADMIN"), getEmailConfig);
app.put("/api/v1/admin/config/email", authenticateJWT, authorizeRoles("ADMIN"), updateEmailConfig);
app.post("/api/v1/admin/config/email/test", authenticateJWT, authorizeRoles("ADMIN"), testEmailConnection);
app.get("/api/v1/admin/config/email/dashboard", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), getEmailDashboardStats);

// Analytics / Reporting APIs
app.get("/api/v1/admin/analytics/pilot", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getPilotAnalytics);

// Mobile Verification API
app.post("/api/v1/mobile/verify-unlock", authenticateJWT, verifyMobileUnlock);
app.post("/api/v1/mobile/register-and-unlock", registerAndUnlock);

// Student Portal API (read-only — student can only see their own data)
app.get("/api/v1/student/attendance", authenticateJWT, authorizeRoles("STUDENT", "ADMIN", "SUPERVISOR", "FACULTY"), getStudentAttendance);

// Initialize HTTP server with attached WebSockets
const server = http.createServer(app);
// Database Warmup Connection Retry Loop

async function warmupDatabase(retries = 10, delayMs = 5000): Promise<boolean> {
  console.log(`[ALAMS DATABASE] Connecting to database...`);
  for (let i = 1; i <= retries; i++) {
    try {
      await prisma.$connect();
      console.log(`[ALAMS DATABASE] Connection established successfully!`);
      // Deploy database-level unique constraint to enforce single-active-session limitations
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_session ON sessions (user_id) WHERE (status = 'ACTIVE');
      `);
      console.log(`[ALAMS DATABASE] Database active user session unique index successfully verified/created.`);
      
      // Auto-seed and preserve the 6 Default Computer Labs
      await ensureDefaultLabs();
      
      return true;
    } catch (err: any) {

      console.warn(`[ALAMS DATABASE] [Attempt ${i}/${retries}] Connection failed: ${err.message || err}`);
      if (i < retries) {
        console.log(`[ALAMS DATABASE] Retrying in ${delayMs / 1000} seconds...`);
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
  console.error(`[ALAMS DATABASE] Max retries reached. Server starting but database operations might fail.`);
  return false;
}

import { startDbSyncWorker, forceDatabaseSync, getAvailableBackups, restoreDatabaseSnapshot } from "./sync/dbSyncService";
import { runNativeStudentSeed } from "./scripts/seedLocalDb";

// Global Process Crash Guards
process.on("uncaughtException", (err) => {
  console.error("🔥 [CRITICAL PROCESS GUARD] Uncaught Exception caught:", err?.message || err);
  console.error(err?.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 [CRITICAL PROCESS GUARD] Unhandled Promise Rejection:", reason);
});

app.post("/api/v1/admin/db/force-sync", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const result = await forceDatabaseSync();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Database synchronization failed" });
  }
});

app.post("/api/v1/admin/db/seed", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const result = await runNativeStudentSeed();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Native database seeding failed" });
  }
});

app.get("/api/v1/admin/db/backups", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const backups = getAvailableBackups();
    return res.json(backups);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to retrieve backups" });
  }
});

app.post("/api/v1/admin/db/restore", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "Filename is required for restore" });

  try {
    const result = await restoreDatabaseSnapshot(filename);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Database restore failed" });
  }
});


// Start database warmup and server listening
warmupDatabase().then(() => {
  server.listen(port, () => {
    console.log(`====================================================`);
    console.log(`[ALAMS SERVER] Operating at http://localhost:${port}`);
    console.log(`====================================================`);
    // Start UDP Discovery Beacon across all NICs
    startUdpBeacon(port);
    // Start Background workers
    startBackgroundWorkers();
    // Start Background Dual-DB Synchronization worker
    startDbSyncWorker();
  });
});

