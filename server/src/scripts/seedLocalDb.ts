import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const localOfflineUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/alams?sslmode=disable";
const prisma = new PrismaClient({ datasources: { db: { url: localOfflineUrl } } });

export async function runNativeStudentSeed(): Promise<{ success: boolean; count: number; message: string }> {
  console.log("🌱 [NATIVE DB SEEDER] Starting pure Node.js/Prisma student database seeding...");

  const sqlFilePath = path.resolve(__dirname, "../../../database-setup/seed_students.sql");
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`SQL seed file not found at: ${sqlFilePath}`);
  }

  const sqlContent = fs.readFileSync(sqlFilePath, "utf8");
  // Extract individual INSERT statements
  const statements = sqlContent
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("INSERT INTO"));

  if (statements.length === 0) {
    throw new Error("No valid INSERT statements found in seed_students.sql");
  }

  let count = 0;
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      count++;
    } catch (err: any) {
      console.warn(`⚠️ Warning executing seed statement ${count + 1}: ${err.message || err}`);
    }
  }

  console.log(`✅ [NATIVE DB SEEDER] Successfully imported ${count} student records into database.`);
  return {
    success: true,
    count,
    message: `Successfully seeded ${count} student records into offline database!`
  };
}

if (require.main === module) {
  runNativeStudentSeed()
    .then(res => console.log(res.message))
    .catch(err => console.error("❌ Seeding error:", err))
    .finally(() => prisma.$disconnect());
}
