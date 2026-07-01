import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log("Cleaning database tables for migration...");
  try {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "security_alerts", "attendance", "sessions", "computers", "labs", "users" CASCADE;`);
    console.log("Truncated successfully.");
  } catch (e) {
    console.error("Truncate failed:", e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
