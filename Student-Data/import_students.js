/**
 * ALAMS - Student Bulk Import Script  v1.1
 * ==========================================
 * Reads "SCSIT DATA STUD.xlsx" from this folder,
 * imports all students into PostgreSQL via Prisma,
 * and saves offline credential records (CSV + JSON).
 *
 * IMPORTANT: Run from the Student-Data\ folder:
 *   node import_students.js
 * Or double-click:
 *   run_import.bat
 */

"use strict";

const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");

// ─── STEP 1: Load .env FIRST (must happen before PrismaClient) ───────────────
const envPath = path.join(__dirname, "../server/.env");
if (!fs.existsSync(envPath)) {
  console.error("FATAL: server/.env not found at: " + envPath);
  console.error("       Please make sure you have the .env file in the server/ folder.");
  process.exit(1);
}

const envLines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val   = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}
console.log("✓  Environment loaded from server/.env");

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set in server/.env");
  process.exit(1);
}
console.log("✓  DATABASE_URL found — connecting to PostgreSQL...");

// ─── STEP 2: Load xlsx ───────────────────────────────────────────────────────
let XLSX;
const xlsxPaths = [
  path.join(__dirname, "../server/node_modules/xlsx"),
  path.join(__dirname, "node_modules/xlsx"),
];
for (const p of xlsxPaths) {
  try { XLSX = require(p); break; } catch {}
}
if (!XLSX) {
  console.error("FATAL: xlsx package not found.");
  console.error("       Run this command first:");
  console.error("       cd ..\\server  &&  npm install xlsx");
  process.exit(1);
}
console.log("✓  xlsx parser loaded");

// ─── STEP 3: Load bcrypt ─────────────────────────────────────────────────────
let bcrypt;
const bcryptPaths = [
  path.join(__dirname, "../server/node_modules/bcryptjs"),
  path.join(__dirname, "node_modules/bcryptjs"),
];
for (const p of bcryptPaths) {
  try { bcrypt = require(p); break; } catch {}
}
if (!bcrypt) {
  console.error("FATAL: bcryptjs package not found.");
  console.error("       Run: cd ..\\server  &&  npm install");
  process.exit(1);
}
console.log("✓  bcryptjs loaded");

// ─── STEP 4: Load Prisma Client (env must be loaded first!) ─────────────────
let prisma;
const prismaPaths = [
  path.join(__dirname, "../server/node_modules/@prisma/client"),
  path.join(__dirname, "node_modules/@prisma/client"),
];
for (const p of prismaPaths) {
  try {
    const { PrismaClient } = require(p);
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } }
    });
    break;
  } catch {}
}
if (!prisma) {
  console.error("FATAL: @prisma/client not found.");
  console.error("       Run: cd ..\\server  &&  npm install  &&  npx prisma generate");
  process.exit(1);
}
console.log("✓  Prisma client ready\n");

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generateSecurePassword(enrollment) {
  const salt = crypto.randomBytes(20).toString("hex");
  return crypto
    .createHash("sha256")
    .update(enrollment + salt + Date.now())
    .digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 8);
}

async function hashValue(value) {
  const s = await bcrypt.genSalt(10);
  return bcrypt.hash(value, s);
}

// ─── COLUMN HEADER AUTO-DETECTOR ─────────────────────────────────────────────
function detectColumns(headerRow) {
  const h = headerRow.map(v => String(v || "").trim().toLowerCase());
  return {
    semIndex:    h.findIndex(x => x.includes("semester") || x === "sem"),
    deptIndex:   h.findIndex(x => x.includes("course") || x.includes("branch") || x.includes("department")),
    enrollIndex: h.findIndex(x => x.includes("enrollment") || x.includes("enroll")),
    nameIndex:   h.findIndex(x => x.includes("name") && !x.includes("contact")),
    emailIndex:  h.findIndex(x => x.includes("email")),
    phoneIndex:  h.findIndex(x => x.includes("contact") || x.includes("phone") || x.includes("mobile")),
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const EXCEL_PATH = path.join(__dirname, "SCSIT DATA STUD.xlsx");
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("FATAL: Excel file not found: " + EXCEL_PATH);
    console.error("       Place 'SCSIT DATA STUD.xlsx' in the Student-Data\\ folder.");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   ALAMS — Student Bulk Import Tool  v1.1             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log("Reading: " + path.basename(EXCEL_PATH));

  // Parse Excel
  const wb    = XLSX.readFile(EXCEL_PATH);
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rows.length < 2) { console.error("ERROR: File has no data rows."); process.exit(1); }

  const cols = detectColumns(rows[0]);
  console.log("\nColumn mapping detected:");
  console.log("  Enrollment No.  → column " + (cols.enrollIndex + 1));
  console.log("  Name            → column " + (cols.nameIndex + 1));
  console.log("  Email           → column " + (cols.emailIndex + 1));
  console.log("  Semester        → column " + (cols.semIndex + 1));
  console.log("  Course / Branch → column " + (cols.deptIndex + 1));
  console.log("  Total rows      : " + (rows.length - 1) + "\n");

  if (cols.enrollIndex === -1 || cols.nameIndex === -1) {
    console.error("ERROR: Cannot detect Enrollment or Name column in the Excel header row.");
    console.error("       Header found: " + rows[0].join(" | "));
    process.exit(1);
  }

  // Build list
  const students = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const enrollmentNumber = String(r[cols.enrollIndex] || "").trim();
    const fullName         = String(r[cols.nameIndex]   || "").trim();
    if (!enrollmentNumber || !fullName) continue;
    students.push({
      enrollmentNumber,
      fullName,
      email:      cols.emailIndex !== -1 ? String(r[cols.emailIndex] || "").trim()  : "",
      semester:   cols.semIndex   !== -1 ? String(r[cols.semIndex]   || "").trim()  : "",
      department: cols.deptIndex  !== -1 ? String(r[cols.deptIndex]  || "").trim()  : "",
    });
  }
  console.log("Parsed " + students.length + " valid student records.\n");

  // Test DB connection first
  console.log("Testing database connection...");
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✓  Database connection OK\n");
  } catch (e) {
    console.error("FATAL: Cannot connect to PostgreSQL: " + e.message);
    console.error("       Check DATABASE_URL in server/.env");
    process.exit(1);
  }

  const defaultPinHash = await hashValue("123456");
  let created = 0, skipped = 0;
  const results = [];

  console.log("Importing students (✓ = created, · = already exists, ✗ = error):");
  console.log("─".repeat(60));

  for (const s of students) {
    try {
      const exists = await prisma.user.findUnique({ where: { enrollmentNumber: s.enrollmentNumber } });
      if (exists) {
        results.push({ ...s, status: "SKIPPED", tempPassword: "" });
        skipped++;
        process.stdout.write("·");
        continue;
      }

      const tempPassword = generateSecurePassword(s.enrollmentNumber);
      const passwordHash = await hashValue(tempPassword);
      const finalEmail   = s.email || (s.enrollmentNumber + "@suas.ac.in");

      await prisma.user.create({
        data: {
          enrollmentNumber: s.enrollmentNumber,
          fullName: s.fullName,
          email: finalEmail,
          semester:   s.semester   || null,
          department: s.department || null,
          year: null, section: null,
          passwordHash,
          pinHash: defaultPinHash,
          role: "STUDENT",
          mustChangePassword: true,
          isActive: true,
        }
      });

      results.push({ ...s, email: finalEmail, status: "CREATED", tempPassword });
      created++;
      process.stdout.write("✓");

    } catch (err) {
      results.push({ ...s, status: "ERROR: " + err.message, tempPassword: "" });
      process.stdout.write("✗");
    }
  }

  console.log("\n\n" + "═".repeat(60));
  console.log("  IMPORT COMPLETE");
  console.log("  Created  : " + created);
  console.log("  Skipped  : " + skipped + " (already in DB)");
  console.log("  Total    : " + students.length);
  console.log("═".repeat(60));

  // Save CSV
  const ts      = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = path.join(__dirname, "ALAMS_Credentials_" + ts + ".csv");
  const csvHead = ["S.No","Enrollment Number","Full Name","Email","Semester","Department","Temp Password","Status"];
  const csvRows = results.map((s, i) =>
    [i+1, s.enrollmentNumber, s.fullName, s.email || s.enrollmentNumber+"@suas.ac.in",
     s.semester||"", s.department||"", s.tempPassword||"", s.status]
    .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")
  );
  fs.writeFileSync(csvPath, [csvHead.join(","), ...csvRows].join("\n"), "utf-8");
  console.log("\n📄 Credentials CSV : " + csvPath);

  // Save JSON
  const jsonPath = path.join(__dirname, "ALAMS_Import_" + ts + ".json");
  fs.writeFileSync(jsonPath, JSON.stringify({ importedAt: new Date().toISOString(), created, skipped, results }, null, 2), "utf-8");
  console.log("📦 Import JSON     : " + jsonPath);
  console.log("\n✅ Done! Refresh the admin web dashboard → Students tab to see all records.\n");
}

main()
  .catch(e => { console.error("\n❌ Fatal error: " + (e.message || e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
