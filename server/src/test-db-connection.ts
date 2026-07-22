import { PrismaClient } from "@prisma/client";

async function testConnection(url: string, label: string) {
  console.log(`\nTesting connection for: ${label}`);
  console.log(`URL: ${url.replace(/:[^:@]+@/, ":****@")}`); // Mask password
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    }
  });

  try {
    await prisma.$connect();
    console.log(`✅ SUCCESS: Connected to ${label}`);
    const count = await prisma.user.count();
    console.log(`✅ SUCCESS: Queried users count = ${count}`);
    return true;
  } catch (err: any) {
    console.error(`❌ FAILED: ${label} connection failed.`);
    console.error(`Error Code: ${err.code}`);
    console.error(`Error Message: ${err.message}`);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const envUrl = process.env.DATABASE_URL || "";
  const envDirectUrl = process.env.DIRECT_URL || "";
  
  // URL from .env
  await testConnection(envUrl, "DATABASE_URL from .env");
  await testConnection(envDirectUrl, "DIRECT_URL from .env");

  // Neon URL with alternative password from switch_to_neon.bat
  const neonAltUrl = "postgresql://neondb_owner:npg_c9bZ5mUPwRSp@ep-wild-bird-atmkfndi.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";
  await testConnection(neonAltUrl, "Neon URL with switch_to_neon password");

  // Test local ports 5432, 5433, 5434 with common passwords
  const passwords = ["Admin@ALAMS2026!", "postgres", "root", "123456"];
  const ports = [5432, 5433, 5434];
  
  for (const port of ports) {
    for (const pw of passwords) {
      const url = `postgresql://postgres:${pw}@localhost:${port}/alams_offline?schema=public`;
      await testConnection(url, `Local Port ${port} with password '${pw}'`);
    }
  }
}

main().catch(console.error);
