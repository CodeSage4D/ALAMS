import { compareValue } from "../utils/crypto";
import prisma from "../prisma";

export interface AuthContext {
  computerId: string;
  ipAddress?: string;
  source?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  user?: any;
  verificationMethod: "ONLINE_PASSWORD" | "OFFLINE_LOGIN" | "PIN_FALLBACK" | "QR_CODE" | "EMAIL_OTP";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface AuthProvider {
  name: string;
  authenticate(enrollmentNumber: string, secret: string, ctx: AuthContext): Promise<AuthResult>;
}

export class OnlinePasswordProvider implements AuthProvider {
  name = "ONLINE_PASSWORD";

  async authenticate(enrollmentNumber: string, secret: string, ctx: AuthContext): Promise<AuthResult> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { enrollmentNumber: enrollmentNumber },
          { enrollmentNumber: enrollmentNumber.split("@")[0] }
        ]
      }
    });

    if (!user || !user.isActive) {
      return {
        success: false,
        error: "Invalid enrollment or inactive account",
        verificationMethod: "ONLINE_PASSWORD",
        riskLevel: "LOW"
      };
    }

    const isPasswordValid = await compareValue(secret, user.passwordHash);
    if (!isPasswordValid) {
      return {
        success: false,
        error: "Invalid secure password",
        user,
        verificationMethod: "ONLINE_PASSWORD",
        riskLevel: "LOW"
      };
    }

    return {
      success: true,
      user,
      verificationMethod: "ONLINE_PASSWORD",
      riskLevel: "LOW"
    };
  }
}

export class OfflineLoginProvider implements AuthProvider {
  name = "OFFLINE_LOGIN";

  async authenticate(enrollmentNumber: string, secret: string, ctx: AuthContext): Promise<AuthResult> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { enrollmentNumber: enrollmentNumber },
          { enrollmentNumber: enrollmentNumber.split("@")[0] }
        ]
      }
    });

    if (!user || !user.isActive) {
      return {
        success: false,
        error: "Invalid enrollment or inactive account",
        verificationMethod: "OFFLINE_LOGIN",
        riskLevel: "LOW"
      };
    }

    const isPinValid = await compareValue(secret, user.pinHash);
    if (!isPinValid) {
      return {
        success: false,
        error: "Invalid offline credentials",
        user,
        verificationMethod: "OFFLINE_LOGIN",
        riskLevel: "MEDIUM"
      };
    }

    return {
      success: true,
      user,
      verificationMethod: "OFFLINE_LOGIN",
      riskLevel: "LOW"
    };
  }
}

export class AuthEngine {
  private static providers = new Map<string, AuthProvider>();

  static {
    // Register default providers
    this.registerProvider(new OnlinePasswordProvider());
    this.registerProvider(new OfflineLoginProvider());
  }

  public static registerProvider(provider: AuthProvider) {
    this.providers.set(provider.name, provider);
  }

  public static async authenticate(
    method: "ONLINE_PASSWORD" | "OFFLINE_LOGIN",
    enrollmentNumber: string,
    secret: string,
    ctx: AuthContext
  ): Promise<AuthResult> {
    const provider = this.providers.get(method);
    if (!provider) {
      return {
        success: false,
        error: `Authentication provider '${method}' is not registered.`,
        verificationMethod: method as any,
        riskLevel: "HIGH"
      };
    }
    return provider.authenticate(enrollmentNumber, secret, ctx);
  }
}
