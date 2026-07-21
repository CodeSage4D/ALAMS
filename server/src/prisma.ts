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

export default prisma;

