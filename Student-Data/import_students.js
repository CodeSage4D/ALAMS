/**
 * ALAMS - Student Bulk Import Script
 * ====================================
 * Reads "SCSIT DATA STUD.xlsx" from this folder,
 * imports all students into PostgreSQL via Prisma,
 * and saves offline credential records (CSV + JSON)
 * to the same folder.
 *
 * Run: node import_students.js
 * Or:  Double-click run_import.bat
 */

const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");

// ─── Load xlsx ───────────────────────────────────────────────────────────────
let XLSX;
try {
  XLSX = require(path.join(__dirname, "../server/node_modules/xlsx"));
} catch {
  try {
    XLSX = require("xlsx");
  } catch {
    console.error("ERROR: xlsx package not found.");
    console.error("Run:  npm install xlsx   (inside server/ folder)");
    process.exit(1);
  }
}

// ─── Load Prisma client ───────────────────────────────────────────────────────
let prisma;
try {
  const { PrismaClient } = require(
    path.join(__dirname, "../server/node_modules/@prisma/client")
  );
  prisma = new PrismaClient();
} catch {
  console.error("ERROR: @prisma/client not found. Run: npm install  (inside server/ folder)");
  process.exit(1);
}

// ─── Load bcrypt ──────────────────────────────────────────────────────────────
let bcrypt;
try {
  bcrypt = require(path.join(__dirname, "../server/node_modules/bcryptjs"));
} catch {
  console.error("ERROR: bcryptjs not found. Run: npm install  (inside server/ folder)");
  process.exit(1);
}

// ─── Load .env from server/ ───────────────────────────────────────────────────
const envPath = path.join(__dirname, "../server/.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
  console.log("✓ Loaded environment from server/.env");
} else {
  console.warn("⚠  server/.env not found — using system environment variables.");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateSecurePassword(enrollment) {
  const randomSalt = crypto.randomBytes(16).toString("hex");
  const raw = crypto
    .createHash("sha256")
    .update(enrollment + randomSalt)
    .digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "");
  // 6–8 character password (always 8 for uniformity)
  return raw.substring(0, 8);
}

async function hashValue(value) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}

// ─── Column header auto-detector ─────────────────────────────────────────────
function detectHeaders(headerRow) {
  const h = headerRow.map((v) => String(v || "").trim().toLowerCase());
  return {
    semIndex:    h.findIndex(x => x.includes("semester") || x === "sem"),
    deptIndex:   h.findIndex(x => x.includes("course") || x.includes("branch") || x.includes("department")),
    enrollIndex: h.findIndex(x => x.includes("enrollment") || x.includes("enroll")),
    nameIndex:   h.findIndex(x => x.includes("name") && !x.includes("contact")),
    phoneIndex:  h.findIndex(x => x.includes("contact") || x.includes("phone") || x.includes("mobile")),
    emailIndex:  h.findIndex(x => x.includes("email")),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const EXCEL_FILE = path.join(__dirname, "SCSIT DATA STUD.xlsx");

  if (!fs.existsSync(EXCEL_FILE)) {
    console.error(`ERROR: Excel file not found at:\n  ${EXCEL_FILE}`);
    process.exit(1);
  }

  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║   ALAMS — Student Bulk Import Tool                ║");
  console.log("╚════════════════════════════════════════════════════╝\n");
  console.log(`📂 Reading: ${path.basename(EXCEL_FILE)}`);

  // ─── Parse Excel ────────────────────────────────────────────────────────────
  const workbook  = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];
  const rows      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) {
    console.error("ERROR: Excel file has no data rows.");
    process.exit(1);
  }

  const cols = detectHeaders(rows[0]);
  console.log(`✓ Headers detected on row 1`);
  console.log(`  Enrollment → col ${cols.enrollIndex + 1}`);
  console.log(`  Name       → col ${cols.nameIndex + 1}`);
  console.log(`  Email      → col ${cols.emailIndex + 1}`);
  console.log(`  Semester   → col ${cols.semIndex + 1}`);
  console.log(`  Dept       → col ${cols.deptIndex + 1}`);
  console.log(`  Total data rows: ${rows.length - 1}\n`);

  if (cols.enrollIndex === -1 || cols.nameIndex === -1) {
    console.error("ERROR: Cannot find Enrollment or Name column. Check the Excel headers.");
    process.exit(1);
  }

  // ─── Build student list from rows ───────────────────────────────────────────
  const studentList = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const enrollmentNumber = String(row[cols.enrollIndex] || "").trim();
    const fullName         = String(row[cols.nameIndex]   || "").trim();
    if (!enrollmentNumber || !fullName) continue;

    const rawSem = cols.semIndex    !== -1 ? String(row[cols.semIndex]    || "").trim() : "";
    const dept   = cols.deptIndex   !== -1 ? String(row[cols.deptIndex]   || "").trim() : "";
    const email  = cols.emailIndex  !== -1 ? String(row[cols.emailIndex]  || "").trim() : "";
    const phone  = cols.phoneIndex  !== -1 ? String(row[cols.phoneIndex]  || "").trim() : "";

    studentList.push({ enrollmentNumber, fullName, email, semester: rawSem, department: dept, phone });
  }

  console.log(`📋 Parsed ${studentList.length} valid student records.`);

  // ─── Default PIN hash ────────────────────────────────────────────────────────
  const defaultPinHash = await hashValue("123456");

  // ─── Import loop ─────────────────────────────────────────────────────────────
  let created = 0, skipped = 0;
  const results = [];

  for (const student of studentList) {
    const { enrollmentNumber, fullName, email, semester, department } = student;

    try {
      const existing = await prisma.user.findUnique({ where: { enrollmentNumber } });

      if (existing) {
        results.push({ ...student, status: "SKIPPED (already exists)", tempPassword: "" });
        skipped++;
        process.stdout.write("·");
        continue;
      }

      const tempPassword   = generateSecurePassword(enrollmentNumber);
      const passwordHash   = await hashValue(tempPassword);
      const finalEmail     = email || `${enrollmentNumber}@suas.ac.in`;

      await prisma.user.create({
        data: {
          enrollmentNumber,
          fullName,
          email: finalEmail,
          semester: semester || null,
          year: null,
          department: department || null,
          section: null,
          passwordHash,
          pinHash: defaultPinHash,
          role: "STUDENT",
          mustChangePassword: true,
          isActive: true,
        }
      });

      results.push({ ...student, email: finalEmail, status: "CREATED", tempPassword });
      created++;
      process.stdout.write("✓");

    } catch (err) {
      results.push({ ...student, status: `ERROR: ${err.message}`, tempPassword: "" });
      process.stdout.write("✗");
    }
  }

  console.log(`\n\n✅ Import complete!`);
  console.log(`   Created : ${created}`);
  console.log(`   Skipped : ${skipped}`);
  console.log(`   Total   : ${studentList.length}`);

  // ─── Save offline CSV ─────────────────────────────────────────────────────────
  const csvTimestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = path.join(__dirname, `ALAMS_Student_Credentials_${csvTimestamp}.csv`);

  const csvHeaders = ["S.No", "Enrollment Number", "Full Name", "Email", "Semester", "Department", "Temp Password", "Status"];
  const csvRows = results.map((s, idx) => [
    idx + 1,
    s.enrollmentNumber,
    s.fullName,
    s.email || `${s.enrollmentNumber}@suas.ac.in`,
    s.semester || "",
    s.department || "",
    s.tempPassword || "",
    s.status
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

  fs.writeFileSync(csvPath, [csvHeaders.join(","), ...csvRows].join("\n"), "utf-8");
  console.log(`\n📄 Credentials CSV saved:\n   ${csvPath}`);

  // ─── Save offline JSON ────────────────────────────────────────────────────────
  const jsonPath = path.join(__dirname, `ALAMS_Student_Import_${csvTimestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ importedAt: new Date().toISOString(), created, skipped, results }, null, 2), "utf-8");
  console.log(`📦 JSON record saved:\n   ${jsonPath}`);

  console.log("\n✨ All done. Students are now live in the database.\n");
}

main()
  .catch(err => {
    console.error("\n❌ Fatal error:", err.message || err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
