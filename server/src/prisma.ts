import { PrismaClient } from "@prisma/client";

const localOfflineUrl = process.env.LOCAL_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/alams?sslmode=disable";
const primaryUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || localOfflineUrl;

let prisma: PrismaClient;

try {
  prisma = new PrismaClient({
    datasources: { db: { url: primaryUrl } }
  });
} catch {
  console.warn("⚠️ Primary database unreachable. Switching to local offline PostgreSQL...");
  prisma = new PrismaClient({
    datasources: { db: { url: localOfflineUrl } }
  });
}

export async function ensureDefaultLabs() {
  try {
    const defaultLabs = [
      { name: "Lab 1 - CS Main Lab", location: "SCSIT Ground Floor - Room 101" },
      { name: "Lab 2 - AI/ML Lab", location: "SCSIT Ground Floor - Room 102" },
      { name: "Lab 3 - Cyber Security Lab", location: "SCSIT First Floor - Room 201" },
      { name: "Lab 4 - Software Engineering Lab", location: "SCSIT First Floor - Room 202" },
      { name: "Lab 5 - Research Lab", location: "SCSIT Second Floor - Room 301" },
      { name: "Lab 6 - Networking Lab", location: "SCSIT Second Floor - Room 302" }
    ];

    for (const lab of defaultLabs) {
      await prisma.lab.upsert({
        where: { name: lab.name },
        update: { location: lab.location },
        create: { name: lab.name, location: lab.location }
      });
    }
    console.log("✅ Default 6 Computer Labs verified & seeded.");
  } catch (err: any) {
    console.warn("⚠️ Lab auto-seeding notice:", err.message || err);
  }
}


export default prisma;


