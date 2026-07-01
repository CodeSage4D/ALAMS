import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret";
const QR_SIGNING_KEY = process.env.QR_SIGNING_KEY || "default_qr_secret";

export interface JWTPayload {
  userId: string;
  enrollmentNumber: string;
  role: string;
}

export interface QRTokenPayload {
  computerId: string;
  deviceName: string;
  labId: string;
  pcNumber: string;
  timestamp: number;
}

export async function hashValue(value: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}

export async function compareValue(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export function generateToken(payload: JWTPayload, expiresIn: number = 28800): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export function generateQRToken(payload: QRTokenPayload): string {
  // Signs the computer data with a tight 60-second expiration window
  return jwt.sign(payload, QR_SIGNING_KEY, { expiresIn: 60 });
}

export function verifyQRToken(token: string): QRTokenPayload {
  return jwt.verify(token, QR_SIGNING_KEY) as QRTokenPayload;
}
