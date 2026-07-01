import { Request, Response } from "express";
import prisma from "../prisma";
import { hashValue, compareValue, generateToken } from "../utils/crypto";
import crypto from "crypto";

export async function signup(req: Request, res: Response) {
  const { enrollmentNumber, password, pin, fullName, role } = req.body;

  if (!enrollmentNumber || !password || !pin || !fullName) {
    return res.status(400).json({ error: "Missing required registration parameters" });
  }

  // Validate format of enrollmentNumber
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const studentRegex = /^ENR[a-zA-Z0-9]+$/i;
  if (!emailRegex.test(enrollmentNumber) && !studentRegex.test(enrollmentNumber)) {
    return res.status(400).json({ error: "Invalid Enrollment Number format. Must be a valid email address or start with 'ENR'" });
  }

  // Validate password length
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long" });
  }

  // Validate PIN (6-digit numeric)
  const pinRegex = /^\d{6}$/;
  if (!pinRegex.test(pin)) {
    return res.status(400).json({ error: "PIN must be exactly a 6-digit numeric code" });
  }

  // Validate fullName length
  if (typeof fullName !== "string" || fullName.trim().length < 2) {
    return res.status(400).json({ error: "Full Name must be at least 2 characters long" });
  }

  // Validate role if provided
  if (role && !["STUDENT", "ADMIN", "SUPERVISOR"].includes(role)) {
    return res.status(400).json({ error: "Invalid user role specified" });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        enrollmentNumber: {
          equals: enrollmentNumber,
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: "User with this Enrollment Number already exists" });
    }

    const passwordHash = await hashValue(password);
    const pinHash = await hashValue(pin);

    const user = await prisma.user.create({
      data: {
        enrollmentNumber,
        passwordHash,
        pinHash,
        fullName,
        role: role || "STUDENT",
        mustChangePassword: true,
        isActive: true,
      },
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user.id,
        enrollmentNumber: user.enrollmentNumber,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function login(req: Request, res: Response) {
  const { enrollmentNumber, password } = req.body;

  if (!enrollmentNumber || !password) {
    console.log("[AUTH AUDIT] Login attempt failed: Missing parameters in request");
    return res.status(400).json({ error: "Enrollment Number and password required" });
  }

  // Validate format of enrollmentNumber
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const studentRegex = /^ENR[a-zA-Z0-9]+$/i;
  if (!emailRegex.test(enrollmentNumber) && !studentRegex.test(enrollmentNumber)) {
    console.log(`[AUTH AUDIT] Login attempt rejected: Invalid identifier format "${enrollmentNumber}"`);
    return res.status(400).json({ error: "Invalid Enrollment Number format" });
  }

  try {
    // Case-insensitive lookup using findFirst
    const user = await prisma.user.findFirst({
      where: {
        enrollmentNumber: {
          equals: enrollmentNumber,
          mode: "insensitive",
        },
      },
    });

    console.log(`[AUTH AUDIT] Login query executed for identifier: "${enrollmentNumber}"`);
    console.log(`  - User found: ${user ? "YES" : "NO"}`);

    if (!user) {
      console.log("  - Authentication Result: REJECTED (User not found)");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log(`  - Account status (isActive): ${user.isActive}`);
    if (!user.isActive) {
      console.log("  - Authentication Result: REJECTED (Account inactive)");
      return res.status(401).json({ error: "Account is inactive" });
    }

    const passwordHashExists = !!user.passwordHash;
    console.log(`  - Password hash exists in database: ${passwordHashExists}`);

    const isPasswordValid = await compareValue(password, user.passwordHash);
    console.log(`  - bcrypt verification result: ${isPasswordValid}`);

    if (!isPasswordValid) {
      console.log("  - Authentication Result: REJECTED (Password mismatch)");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log(`  - Role assigned: ${user.role}`);

    // Check password expiration if defined
    if (user.passwordExpiresAt && user.passwordExpiresAt < new Date()) {
      console.log("  - Authentication Result: REJECTED (Password expired)");
      return res.status(401).json({ error: "Password expired. Please contact support or reset password." });
    }

    const token = generateToken({
      userId: user.id,
      enrollmentNumber: user.enrollmentNumber,
      role: user.role,
    });
    console.log("  - JWT generated successfully: YES");

    // If password change is required, return mustChangePassword flag with the token
    if (user.mustChangePassword) {
      console.log("  - Action required: Forced password change on first login");
      return res.json({
        mustChangePassword: true,
        token,
        user: {
          id: user.id,
          enrollmentNumber: user.enrollmentNumber,
          fullName: user.fullName,
          role: user.role,
        },
      });
    }

    // Update lastLogin for standard login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    console.log("  - Authentication Result: SUCCESS");
    return res.json({
      token,
      user: {
        id: user.id,
        enrollmentNumber: user.enrollmentNumber,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("[AUTH AUDIT] Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function changePassword(req: Request, res: Response) {
  const userId = (req as any).user?.userId;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isOldPasswordValid = await compareValue(oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    const newPasswordHash = await hashValue(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        lastLogin: new Date(), // count password change as active login
        passwordExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days validity
      },
    });

    console.log(`[AUTH AUDIT] Password changed successfully for User ID: ${userId}`);

    return res.json({ message: "Password updated successfully" });
  } catch (err: any) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function requestPasswordReset(req: Request, res: Response) {
  const { enrollmentNumber } = req.body;

  if (!enrollmentNumber) {
    return res.status(400).json({ error: "Enrollment Number or Email is required" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        enrollmentNumber: {
          equals: enrollmentNumber,
          mode: "insensitive",
        },
      },
    });

    if (!user) {
      return res.json({
        message: "If the account exists, a reset token has been generated.",
      });
    }

    // Generate 6-digit alphanumeric token for simple pilot reset flow
    const resetToken = crypto.randomBytes(3).toString("hex").toUpperCase();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour expiration

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    console.log(`[AUTH AUDIT] Password reset token generated for user ${user.enrollmentNumber}: ${resetToken}`);

    return res.json({
      message: "Reset token generated successfully.",
      resetToken,
    });
  } catch (err: any) {
    console.error("Request password reset error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: "Reset token and new password are required" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: resetToken,
        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const newPasswordHash = await hashValue(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    console.log(`[AUTH AUDIT] Password reset completed successfully for user: ${user.enrollmentNumber}`);

    return res.json({ message: "Password reset successful" });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
