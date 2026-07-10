import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import path from "path";

// Load configuration
dotenv.config();

import { signup, login, changePassword, requestPasswordReset, resetPassword } from "./controllers/authController";
import {
  getStudents,
  toggleStudentStatus,
  getLabs,
  createLab,
  getComputers,
  createComputer,
  toggleFallback,
  remoteUnlock,
  remoteLock,
  getActiveSessions,
  getAttendance,
  getSecurityAlerts,
  resolveAlert,
  getPendingComputers,
  approveComputer,
  updateComputerStatus,
  lockAllWorkstations,
  endAllSessions,
  startPractical,
  endPractical,
  getDiagnostics,
  queueRemoteCommand,
  createGpoPolicy,
  getGpoPolicies,
  deleteGpoPolicy,
  importStudents,
  adminResetStudentPassword,
  shutdownAllWorkstations,
  updateProfileAuthConfig,
} from "./controllers/adminController";
import {
  getQRToken,
  verifyLocalPINAuth,
  clientLogout,
  verifyMobileUnlock,
  verifySessionPIN,
  watchdogHeartbeat,
  watchdogAlert,
  getStudentAttendance,
  registerAndUnlock,
  dispatchTelemetry,
} from "./controllers/clientController";
import { getPilotAnalytics, recordFailedLogin } from "./controllers/analyticsController";
import { authenticateJWT, authorizeRoles } from "./middleware/auth";
import { initWebSocketServer, requestDiagnosticsFromClient } from "./websocket";
import { startUdpBeacon } from "./utils/udpBeacon";
import prisma from "./prisma";

const app = express();
const port = process.env.PORT || 5000;

// CORS — apply strict origin whitelist from environment
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5000")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser tool calls (e.g., WPF client, Watchdog) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) {
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
app.get("/health", async (req, res) => {
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
});
app.get("/api/v1/health/diagnostics", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), getDiagnostics);

// Authentication API
app.post("/api/v1/auth/signup", signup);
app.post("/api/v1/auth/login", login);
app.post("/api/v1/auth/change-password", authenticateJWT, changePassword);
app.post("/api/v1/auth/reset-password-request", requestPasswordReset);
app.post("/api/v1/auth/reset-password", resetPassword);

// Admin / Supervisor / Faculty APIs
app.get("/api/v1/admin/students", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getStudents);
app.put("/api/v1/admin/students/:id/status", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), toggleStudentStatus);
app.post("/api/v1/admin/students/import", authenticateJWT, authorizeRoles("ADMIN"), importStudents);
app.post("/api/v1/admin/students/:id/reset-password", authenticateJWT, authorizeRoles("ADMIN"), adminResetStudentPassword);

app.get("/api/v1/admin/labs", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getLabs);
app.post("/api/v1/admin/labs", authenticateJWT, authorizeRoles("ADMIN"), createLab);

app.get("/api/v1/admin/computers", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getComputers);
app.get("/api/v1/admin/computers/pending", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getPendingComputers);
app.post("/api/v1/admin/computers", authenticateJWT, authorizeRoles("ADMIN"), createComputer);
app.post("/api/v1/admin/computers/approve", authenticateJWT, authorizeRoles("ADMIN"), approveComputer);
app.put("/api/v1/admin/computers/:id/status", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR"), updateComputerStatus);
app.put("/api/v1/admin/computers/:id/fallback", authenticateJWT, authorizeRoles("ADMIN"), toggleFallback);
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

// Analytics / Reporting APIs
app.get("/api/v1/admin/analytics/pilot", authenticateJWT, authorizeRoles("ADMIN", "SUPERVISOR", "FACULTY"), getPilotAnalytics);

// Mobile Verification API
app.post("/api/v1/mobile/verify-unlock", authenticateJWT, verifyMobileUnlock);
app.post("/api/v1/mobile/register-and-unlock", registerAndUnlock);

// Student Portal API (read-only — student can only see their own data)
app.get("/api/v1/student/attendance", authenticateJWT, authorizeRoles("STUDENT", "ADMIN", "SUPERVISOR", "FACULTY"), getStudentAttendance);

// Initialize HTTP server with attached WebSockets
const server = http.createServer(app);
initWebSocketServer(server);

server.listen(port, () => {
  console.log(`====================================================`);
  console.log(`[ALAMS SERVER] Operating at http://localhost:${port}`);
  console.log(`====================================================`);
  // Start UDP Discovery Beacon
  startUdpBeacon(port);
});
