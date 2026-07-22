import { Request, Response } from "express";
import prisma from "../prisma";
import { hashValue, compareValue, generateToken, generateSecurePassword } from "./passwordHelper";
import { createAuditLog } from "../monitoring/logger";
import { AuthEngine } from "./authEngine";
import crypto from "crypto";

// --- CUSTOM INTERFACES ---
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- SYSTEM SIGNUP (Mainly for Admins/Faculty) ---
export async function signup(req: Request, res: Response) {
  const { enrollmentNumber, password, pin, fullName, role, email, semester, department, section } = req.body;

  if (!enrollmentNumber || !password || !pin || !fullName) {
    return res.status(400).json({ error: "Missing required registration parameters" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const studentRegex = /^ENR[a-zA-Z0-9]+$/i;
  if (!emailRegex.test(enrollmentNumber) && !studentRegex.test(enrollmentNumber)) {
    return res.status(400).json({ error: "Invalid format. Must be a valid email or start with 'ENR'" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long" });
  }

  const pinRegex = /^\d{6}$/;
  if (!pinRegex.test(pin)) {
    return res.status(400).json({ error: "PIN must be exactly a 6-digit numeric code" });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { enrollmentNumber: { equals: enrollmentNumber, mode: "insensitive" } },
          { email: email ? { equals: email, mode: "insensitive" } : undefined }
        ].filter(Boolean) as any
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: "User with this Enrollment/Email already exists" });
    }

    const passwordHash = await hashValue(password);
    const pinHash = await hashValue(pin);

    const user = await prisma.user.create({
      data: {
        enrollmentNumber,
        passwordHash,
        pinHash,
        fullName,
        email: email || (emailRegex.test(enrollmentNumber) ? enrollmentNumber : `${enrollmentNumber}@suas.ac.in`),
        semester: semester || null,
        department: department || null,
        section: section || null,
        role: role || "STUDENT",
        mustChangePassword: true,
        isActive: true,
      },
    });

    await createAuditLog("USER_SIGNUP", `Created account for ${user.fullName} (${user.enrollmentNumber}) as ${user.role}`);

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

// --- SYSTEM LOGIN (Web Portal Dashboard Access) ---
export async function login(req: Request, res: Response) {
  const { enrollmentNumber, password } = req.body; // enrollmentNumber field can contain Email or Enrollment ID

  if (!enrollmentNumber || !password) {
    return res.status(400).json({ error: "Login identifier and password are required" });
  }

  try {
    // Lookup by Email first, fallback to case-insensitive Enrollment Number
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: enrollmentNumber, mode: "insensitive" } },
          { enrollmentNumber: { equals: enrollmentNumber, mode: "insensitive" } }
        ]
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    const isPasswordValid = await compareValue(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.passwordExpiresAt && user.passwordExpiresAt < new Date()) {
      return res.status(401).json({ error: "Password expired. Please contact support or reset password." });
    }

    const token = generateToken({
      userId: user.id,
      enrollmentNumber: user.enrollmentNumber,
      role: user.role,
    });

    if (user.mustChangePassword) {
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

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await createAuditLog("LOGIN_SUCCESS", `Logged in ${user.fullName} (${user.enrollmentNumber}) via web console`);

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
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- CHANGE PASSWORD (Forced or Self-Initiated) ---
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
        lastLogin: new Date(),
        passwordExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days validity
      },
    });

    await createAuditLog("PASSWORD_CHANGE", `Updated password for ${user.fullName} (${user.enrollmentNumber})`);

    return res.json({ message: "Password updated successfully" });
  } catch (err: any) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- REQUEST PASSWORD RESET (Generate Reset Token) ---
export async function requestPasswordReset(req: Request, res: Response) {
  const { enrollmentNumber } = req.body;

  if (!enrollmentNumber) {
    return res.status(400).json({ error: "Enrollment Number or Email is required" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: enrollmentNumber, mode: "insensitive" } },
          { enrollmentNumber: { equals: enrollmentNumber, mode: "insensitive" } }
        ]
      },
    });

    if (!user) {
      return res.json({ message: "If the account exists, a reset token has been generated." });
    }

    const resetToken = crypto.randomBytes(3).toString("hex").toUpperCase();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour expiration

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    await createAuditLog("PASSWORD_RESET_REQUEST", `Generated password reset token for user ${user.enrollmentNumber}`);

    return res.json({
      message: "Reset token generated successfully.",
      resetToken,
    });
  } catch (err: any) {
    console.error("Request password reset error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- RESET PASSWORD (Using Token) ---
export async function resetPassword(req: Request, res: Response) {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: "Reset token and new password are required" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: resetToken,
        passwordResetExpires: { gt: new Date() },
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

    await createAuditLog("PASSWORD_RESET_COMPLETE", `Password reset completed for ${user.fullName} (${user.enrollmentNumber})`);

    return res.json({ message: "Password reset successful" });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- GET STUDENTS LIST (Admin Management) ---
export async function getStudents(req: AuthenticatedRequest, res: Response) {
  const { semester, department, section, trash } = req.query;
  try {
    const query: any = {};
    if (semester) query.semester = String(semester);
    if (department) query.department = String(department);
    if (section) query.section = String(section);

    if (trash === "true") {
      query.deletedAt = { not: null };
    } else {
      query.deletedAt = null;
    }

    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        ...query
      },
      orderBy: { enrollmentNumber: "asc" }
    });
    return res.json(students);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch student profiles" });
  }
}

// --- CREATE STUDENT PROFILE (Admin Manual Add) ---
export async function createStudent(req: AuthenticatedRequest, res: Response) {
  const { enrollmentNumber, fullName, email, semester, year, department, section } = req.body;

  if (!enrollmentNumber || !fullName) {
    return res.status(400).json({ error: "Enrollment Number and Full Name are required" });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { enrollmentNumber }
    });

    if (existing) {
      return res.status(400).json({ error: "Student with this enrollment number already exists" });
    }

    const defaultPinHash = await hashValue("123456");
    const tempPassword = generateSecurePassword(enrollmentNumber);
    const passwordHash = await hashValue(tempPassword);
    const finalEmail = email || `${enrollmentNumber}@student.suas.ac.in`;

    const student = await prisma.user.create({
      data: {
        enrollmentNumber,
        fullName,
        email: finalEmail,
        semester: semester || "1",
        year: year || null,
        department: department || "B.Tech-CSIT",
        section: section || null,
        passwordHash,
        pinHash: defaultPinHash,
        role: "STUDENT",
        mustChangePassword: true,
        isActive: true
      }
    });

    await createAuditLog("STUDENT_CREATED", `Admin manually created student profile ${student.fullName} (${student.enrollmentNumber})`, req.user?.userId);

    return res.status(201).json({
      message: "Student account created successfully",
      student: {
        id: student.id,
        enrollmentNumber: student.enrollmentNumber,
        fullName: student.fullName,
        email: student.email,
        tempPassword
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to create student account" });
  }
}

// --- TOGGLE STUDENT STATUS (Active/Inactive) ---
export async function toggleStudentStatus(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const student = await prisma.user.findUnique({ where: { id } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !student.isActive }
    });

    await createAuditLog("STUDENT_STATUS_TOGGLED", `Toggled status for student ${student.fullName}. Active: ${updated.isActive}`, req.user?.userId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update student status" });
  }
}

// --- SOFT DELETE STUDENT ---
export async function softDeleteStudent(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const student = await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });

    await createAuditLog("STUDENT_SOFT_DELETED", `Soft deleted student profile ${student.fullName} (${student.enrollmentNumber})`, req.user?.userId);
    return res.json({ message: "Student account soft-deleted successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete student account" });
  }
}

// --- RESTORE SOFT DELETED STUDENT ---
export async function restoreStudent(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const student = await prisma.user.update({
      where: { id },
      data: { deletedAt: null, isActive: true }
    });

    await createAuditLog("STUDENT_RESTORED", `Restored soft-deleted student profile ${student.fullName} (${student.enrollmentNumber})`, req.user?.userId);
    return res.json({ message: "Student profile restored successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to restore student profile" });
  }
}

// --- PURGE STUDENT FROM TRASH ---
export async function purgeTrashStudent(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const student = await prisma.user.findUnique({ where: { id } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    await prisma.user.delete({ where: { id } });

    await createAuditLog("STUDENT_PURGED", `Permanently purged student account ${student.fullName} (${student.enrollmentNumber}) from database`, req.user?.userId);
    return res.json({ message: "Student permanently deleted from database." });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to permanently delete student profile" });
  }
}

// --- BULK PROMOTE / DEMOTE SEMESTERS ---
export async function bulkPromoteDemoteStudents(req: AuthenticatedRequest, res: Response) {
  const { currentSemester, targetSemester, department } = req.body;
  if (!currentSemester || !targetSemester) {
    return res.status(400).json({ error: "Current semester and target semester are required" });
  }

  try {
    const filter: any = { semester: String(currentSemester), role: "STUDENT" };
    if (department) filter.department = department;

    const result = await prisma.user.updateMany({
      where: filter,
      data: { semester: String(targetSemester) }
    });

    await createAuditLog("STUDENT_BULK_SEMESTER_CHANGE", `Bulk updated students from semester ${currentSemester} to ${targetSemester}. Affected count: ${result.count}`, req.user?.userId);
    return res.json({ message: `Successfully updated ${result.count} students to semester ${targetSemester}.` });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update semester records" });
  }
}

// --- ADMIN RESET STUDENT PASSWORD (Generates new temp password) ---
export async function adminResetStudentPassword(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const student = await prisma.user.findUnique({ where: { id } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const tempPassword = generateSecurePassword(student.enrollmentNumber);
    const newPasswordHash = await hashValue(tempPassword);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: true,
        passwordChangedAt: null
      }
    });

    await createAuditLog(
      "STUDENT_PASSWORD_RESET",
      `Admin reset password for student ${student.fullName} (${student.enrollmentNumber}).`,
      req.user?.userId
    );

    return res.json({
      message: "Password reset successfully",
      enrollmentNumber: student.enrollmentNumber,
      fullName: student.fullName,
      tempPassword
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to reset student password" });
  }
}

// --- BULK GENERATE PASSWORDS FOR ALL STUDENTS IN TRASH/ACTIVE ---
export async function bulkGeneratePasswords(req: AuthenticatedRequest, res: Response) {
  try {
    const students = await prisma.user.findMany({
      where: { role: "STUDENT", deletedAt: null }
    });

    const generated = [];
    const defaultPinHash = await hashValue("123456");

    for (const student of students) {
      const tempPassword = generateSecurePassword(student.enrollmentNumber);
      const passwordHash = await hashValue(tempPassword);

      await prisma.user.update({
        where: { id: student.id },
        data: {
          passwordHash,
          mustChangePassword: true
        }
      });

      generated.push({
        enrollmentNumber: student.enrollmentNumber,
        fullName: student.fullName,
        email: student.email,
        tempPassword
      });
    }

    await createAuditLog(
      "BULK_PASSWORD_GENERATION",
      `Admin bulk-generated passwords for ${generated.length} student accounts.`,
      req.user?.userId
    );

    return res.json({
      message: `Generated passwords for ${generated.length} students.`,
      count: generated.length,
      generated
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to bulk generate student passwords" });
  }
}

// --- VERIFY ADMINISTRATOR OVERRIDE PIN ---
export async function verifyAdminPIN(req: Request, res: Response) {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "PIN is required" });

  try {
    // Admin list check
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "SUPERVISOR"] },
        isActive: true,
        deletedAt: null
      }
    });

    for (const admin of admins) {
      const match = await compareValue(pin, admin.pinHash);
      if (match) {
        return res.json({
          success: true,
          adminUser: {
            id: admin.id,
            fullName: admin.fullName,
            role: admin.role
          }
        });
      }
    }

    return res.status(401).json({ success: false, error: "Invalid Administrator PIN" });
  } catch (err: any) {
    return res.status(500).json({ error: "PIN validation error" });
  }
}
