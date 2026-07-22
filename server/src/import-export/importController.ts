import { Request, Response } from "express";
import prisma from "../prisma";
import { hashValue, generateSecurePassword } from "../auth/passwordHelper";
import { createAuditLog } from "../monitoring/logger";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- STUDENT BULK IMPORT ---
export async function importStudents(req: AuthenticatedRequest, res: Response) {
  const studentsList = req.body;

  if (!Array.isArray(studentsList)) {
    return res.status(400).json({ error: "Expected an array of student objects" });
  }

  try {
    let createdCount = 0;
    let skippedCount = 0;
    const defaultPinHash = await hashValue("123456");

    for (const student of studentsList) {
      const { enrollmentNumber, fullName, email, semester, year, department, section } = student;
      if (!enrollmentNumber || !fullName) {
        skippedCount++;
        continue;
      }

      // Check if user exists
      const existing = await prisma.user.findUnique({
        where: { enrollmentNumber }
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // Generate secure temporary password
      const tempPassword = generateSecurePassword(enrollmentNumber);
      const passwordHash = await hashValue(tempPassword);

      // Auto generate email if not provided
      const finalEmail = email || `${enrollmentNumber}@suas.ac.in`;

      await prisma.user.create({
        data: {
          enrollmentNumber,
          fullName,
          email: finalEmail,
          semester: semester || null,
          year: year || null,
          department: department || null,
          section: section || null,
          passwordHash,
          pinHash: defaultPinHash,
          role: "STUDENT",
          mustChangePassword: true,
          isActive: true
        }
      });

      student.tempPassword = tempPassword;
      student.email = finalEmail;
      student.status = "CREATED";
      createdCount++;
    }

    await createAuditLog(
      "STUDENT_BULK_IMPORT",
      `Bulk imported ${createdCount} student profiles. Skipped/Existing: ${skippedCount}`,
      req.user?.userId
    );

    return res.json({
      message: `Successfully imported ${createdCount} students. Skipped ${skippedCount} existing or invalid records.`,
      importedStudents: studentsList
    });
  } catch (err: any) {
    console.error("Bulk import failed:", err);
    return res.status(500).json({ error: err.message || "Bulk student import failed" });
  }
}
