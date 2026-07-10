import { Request, Response, NextFunction } from "express";
import { verifyToken, JWTPayload } from "../utils/crypto";

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Localhost loopback bypass for local Server GUI Console operations
  const clientIp = req.ip || req.socket.remoteAddress || "";
  if (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.includes("127.0.0.1") || clientIp === "::ffff:127.0.0.1") {
    req.user = {
      userId: "LOCAL_ADMIN",
      enrollmentNumber: "LOCAL_ADMIN",
      role: "ADMIN"
    };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

export function authorizeRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated request" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }

    next();
  };
}
