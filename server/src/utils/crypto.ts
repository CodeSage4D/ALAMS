import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

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
  return jwt.sign(payload, QR_SIGNING_KEY, { expiresIn: 60 });
}

export function verifyQRToken(token: string): QRTokenPayload {
  return jwt.verify(token, QR_SIGNING_KEY) as QRTokenPayload;
}

// AES-256-GCM Settings Credentials Encryption
const ALGORITHM = "aes-256-gcm";
const DEFAULT_KEY_SALT = "alams-gateway-encryption-default-salt-key-2026";

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || DEFAULT_KEY_SALT;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptString(text: string): string {
  if (!text) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptString(encryptedText: string): string {
  if (!encryptedText) return "";
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      return encryptedText;
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err);
    return encryptedText;
  }
}

export function computeHmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function signConfigData(data: string, secret: string): string {
  return computeHmac(data, secret);
}

