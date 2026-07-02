import { PrismaClient, Role, ComputerStatus, VerificationMethod, AttendanceStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function hashValue(value: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║ ALAMS Production Pilot Seed Setup... ║");
  console.log("╚══════════════════════════════════════╝");

  // ── Clear existing data ────────────────────────────────────────────────────
  console.log("\n[1/6] Clearing existing data...");
  await prisma.auditLog.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.session.deleteMany();
  await prisma.securityAlert.deleteMany();
  await prisma.computer.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.lab.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  console.log("      ✔ Database cleared.");

  // ── Hash credentials ───────────────────────────────────────────────────────
  console.log("\n[2/6] Hashing credentials...");
  const adminPasswordHash = await hashValue("Pilot@2026!");
  const studentPasswordHash = await hashValue("Student@2026!");

  const adminPinHash = await hashValue("112233");
  const studentPinHash = await hashValue("123456");
  console.log("      ✔ Credentials hashed (bcrypt salt=10).");

  // ── Create Configuration Profiles ──────────────────────────────────────────
  console.log("\n[3/6] Creating Configuration Profiles...");
  const engProfile = await prisma.profile.create({
    data: {
      name: "Engineering Lab Profile",
      qrLifetime: 60,
      heartbeatInterval: 30,
      offlinePinEnabled: true,
      sessionTimeout: 120,
      idleTimeout: 15,
    },
  });

  const generalProfile = await prisma.profile.create({
    data: {
      name: "General Lab Profile",
      qrLifetime: 60,
      heartbeatInterval: 30,
      offlinePinEnabled: true,
      sessionTimeout: 120,
      idleTimeout: 15,
    },
  });
  console.log("      ✔ Config profiles generated.");

  // ── Create Users ───────────────────────────────────────────────────────────
  console.log("\n[4/6] Creating pilot administrative, faculty, and student accounts...");

  const adminAccounts = [
    { email: "karan.mishra@suas.ac.in", name: "Karan Mishra", role: Role.ADMIN },
    { email: "nitin.panchal@suas.ac.in", name: "Nitin Panchal", role: Role.ADMIN },
    { email: "prashant.patil@suas.ac.in", name: "Prashant Patil", role: Role.ADMIN },
    { email: "mrityunjay@suas.ac.in", name: "Mrityunjay", role: Role.ADMIN },
    { email: "monark.riakwar@suas.ac.in", name: "Monark Riakwar", role: Role.SUPERVISOR },
    { email: "salman.khan@suas.ac.in", name: "Salman Khan", role: Role.SUPERVISOR },
    { email: "faculty.member@suas.ac.in", name: "Dr. Faculty Member", role: Role.FACULTY }
  ];

  const admins: any[] = [];
  let facultyUser: any = null;

  for (const admin of adminAccounts) {
    const created = await prisma.user.create({
      data: {
        enrollmentNumber: admin.email,
        fullName: admin.name,
        passwordHash: adminPasswordHash,
        pinHash: adminPinHash,
        role: admin.role,
        isActive: true,
        mustChangePassword: true,
      }
    });
    admins.push(created);
    if (admin.role === Role.FACULTY) {
      facultyUser = created;
    }
  }

  const studentData = [
    { enrollmentNumber: "ENR2026001", fullName: "Arjun Sharma" },
    { enrollmentNumber: "ENR2026002", fullName: "Priya Mehta" },
    { enrollmentNumber: "ENR2026003", fullName: "Rohan Verma" },
    { enrollmentNumber: "ENR2026004", fullName: "Sneha Patel" },
    { enrollmentNumber: "ENR2026005", fullName: "Karan Singh" },
    { enrollmentNumber: "ENR2026006", fullName: "Ananya Nair" },
    { enrollmentNumber: "ENR2026007", fullName: "Devraj Gupta" },
    { enrollmentNumber: "ENR2026008", fullName: "Meera Rao" },
    { enrollmentNumber: "ENR2026009", fullName: "Vikram Joshi" },
    { enrollmentNumber: "ENR2026010", fullName: "Tanvi Desai" },
  ];

  const students: any[] = [];
  for (const s of studentData) {
    const student = await prisma.user.create({
      data: {
        enrollmentNumber: s.enrollmentNumber,
        fullName: s.fullName,
        passwordHash: studentPasswordHash,
        pinHash: studentPinHash,
        role: Role.STUDENT,
        isActive: true,
        mustChangePassword: true,
      },
    });
    students.push(student);
  }

  console.log(`      ✔ Created: ${admins.length} administrative/faculty users, ${students.length} students.`);

  // ── Create Academic Subjects ──────────────────────────────────────────────
  console.log("\nCreating academic subjects...");
  const subDSA = await prisma.subject.create({
    data: { name: "Data Structures & Algorithms", code: "CS-301" }
  });
  const subCN = await prisma.subject.create({
    data: { name: "Computer Networks", code: "CS-302" }
  });
  const subOS = await prisma.subject.create({
    data: { name: "Operating Systems", code: "CS-303" }
  });
  console.log("      ✔ Seeded subjects.");

  // ── Create Labs ────────────────────────────────────────────────────────────
  console.log("\n[5/6] Creating pilot lab zone with configuration profile...");

  const labA = await prisma.lab.create({
    data: {
      name: "SUAS Lab A",
      location: "Block A — Room 102",
      subnet: "127.0.0.0/8", // matches loopback for local tests
      profileId: engProfile.id,
      semester: "3",
      branch: "Computer Science",
      section: "A",
      batch: "B1",
    },
  });
  console.log("      ✔ Created SUAS Lab A zone with loopback subnet validation configuration.");

  // ── Create Timetable slots ───────────────────────────────────────────────
  console.log("\nSeeding timetable weekly slots...");
  
  // Weekly slots for Monday through Saturday
  const timetableSlots = [];
  for (let day = 0; day <= 6; day++) {
    const slot = await prisma.timetableSlot.create({
      data: {
        labId: labA.id,
        subjectId: subDSA.id,
        facultyId: facultyUser.id,
        dayOfWeek: day,
        startTime: "08:00",
        endTime: "21:00", // wide range to ensure active matching in tests
        semester: "3",
        branch: "Computer Science",
        section: "A",
        batch: "B1"
      }
    });
    timetableSlots.push(slot);
  }
  console.log("      ✔ Timetable slot records initialized for current week matching.");

  // ── Create Approved Computers ────────────────
  console.log("\nRegistering pilot workstations...");

  const computerData = [
    { pcNumber: "PC-01", deviceName: "SUAS-LABA-PC01", ipAddress: "127.0.0.1", macAddress: "00:1A:2B:3C:4D:11", qrSeed: "suas-laba-pc01-seed-2026-pilot" },
    { pcNumber: "PC-02", deviceName: "SUAS-LABA-PC02", ipAddress: "10.0.3.102", macAddress: "00:1A:2B:3C:4D:12", qrSeed: "suas-laba-pc02-seed-2026-pilot" },
    { pcNumber: "PC-03", deviceName: "SUAS-LABA-PC03", ipAddress: "10.0.3.103", macAddress: "00:1A:2B:3C:4D:13", qrSeed: "suas-laba-pc03-seed-2026-pilot" },
    { pcNumber: "PC-04", deviceName: "SUAS-LABA-PC04", ipAddress: "10.0.3.104", macAddress: "00:1A:2B:3C:4D:14", qrSeed: "suas-laba-pc04-seed-2026-pilot" },
    { pcNumber: "PC-05", deviceName: "SUAS-LABA-PC05", ipAddress: "10.0.3.105", macAddress: "00:1A:2B:3C:4D:15", qrSeed: "suas-laba-pc05-seed-2026-pilot" },
  ];

  const computers: any[] = [];
  for (const c of computerData) {
    const pc = await prisma.computer.create({
      data: {
        labId: labA.id,
        pcNumber: c.pcNumber,
        deviceName: c.deviceName,
        ipAddress: c.ipAddress,
        macAddress: c.macAddress,
        qrSeed: c.qrSeed,
        fallbackEnabled: true,
        status: ComputerStatus.APPROVED,
        trustStatus: "TRUSTED",
        deviceGroup: "Workstation",
      },
    });
    computers.push(pc);
  }

  console.log(`      ✔ Registered ${computers.length} pilot workstations.`);

  // ── Create Sample Sessions & Attendance (Demo History) ────────────────────
  console.log("\n[6/6] Creating pilot session history...");

  const baseTime = Date.now();

  const demoSessions = [
    { student: students[0], pc: computers[0], method: VerificationMethod.QR_CODE,    hoursAgo: 3,   duration: 65, status: AttendanceStatus.PRESENT },
    { student: students[1], pc: computers[1], method: VerificationMethod.QR_CODE,    hoursAgo: 3,   duration: 55, status: AttendanceStatus.PRESENT },
    { student: students[2], pc: computers[2], method: VerificationMethod.PIN_FALLBACK, hoursAgo: 2.5, duration: 25, status: AttendanceStatus.PARTIAL },
    { student: students[3], pc: computers[3], method: VerificationMethod.QR_CODE,    hoursAgo: 2,   duration: 10, status: AttendanceStatus.ABSENT },
    { student: students[4], pc: computers[4], method: VerificationMethod.QR_CODE,    hoursAgo: 2,   duration: 70, status: AttendanceStatus.LATE },
  ];

  for (const demo of demoSessions) {
    const loginTime  = new Date(baseTime - demo.hoursAgo * 3600000);
    const logoutTime = new Date(loginTime.getTime() + demo.duration * 60000);

    const session = await prisma.session.create({
      data: {
        userId: demo.student.id,
        computerId: demo.pc.id,
        verificationMethod: demo.method,
        status: "COMPLETED",
        loginTime,
        logoutTime,
        durationMinutes: demo.duration,
        unlockLatencyMs: demo.method === VerificationMethod.QR_CODE
          ? Math.floor(Math.random() * 4000) + 2000
          : Math.floor(Math.random() * 2000) + 1000,
        subjectId: subDSA.id,
        facultyId: facultyUser.id,
        timetableSlotId: timetableSlots[0].id,
      },
    });

    await prisma.attendance.create({
      data: {
        userId: demo.student.id,
        sessionId: session.id,
        checkIn: loginTime,
        checkOut: logoutTime,
        status: demo.status,
        duration: demo.duration,
        practicalHours: parseFloat((demo.duration / 60.0).toFixed(1)),
        subjectId: subDSA.id,
        facultyId: facultyUser.id,
      },
    });
  }

  // Sample security alerts
  await prisma.securityAlert.create({
    data: {
      computerId: computers[1].id,
      alertType: "failed_login",
      alertSeverity: "WARNING",
      details: "Multiple invalid PIN attempts on SUAS-LABA-PC02.",
    },
  });

  // Seed default audit logs
  await prisma.auditLog.create({
    data: {
      action: "DEVICE_APPROVED",
      computerId: computers[0].id,
      userId: admins[0].id,
      details: "Workstation SUAS-LABA-PC01 approved & linked to Engineering Profile.",
    }
  });

  console.log("      ✔ Created pilot sessions with attendance logs.");
  console.log("      ✔ Created sample security alerts.");
  console.log("      ✔ Seeded immutable audit log records.");

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║             PILOT DEPLOYMENT CREDENTIAL SUMMARY               ║");
  console.log("╠═══════════════════════════════════════════════════════════════╣");
  console.log("║  ADMINISTRATORS / SUPERVISORS                                 ║");
  console.log("║    karan.mishra@suas.ac.in (Admin)                            ║");
  console.log("║    faculty.member@suas.ac.in (Faculty)                        ║");
  console.log("║       Password : Pilot@2026!                                  ║");
  console.log("║       PIN      : 112233                                       ║");
  console.log("╠═══════════════════════════════════════════════════════════════╣");
  console.log("║  STUDENTS                                                     ║");
  console.log("║    ENR2026001 – ENR2026010                                    ║");
  console.log("║       Password : Student@2026!                                ║");
  console.log("║       PIN      : 123456                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");
}

main()
  .catch((e) => {
    console.error("\n[ERROR] Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("[DONE] Seeding complete.\n");
  });
