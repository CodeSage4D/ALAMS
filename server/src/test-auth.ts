import { PrismaClient } from "@prisma/client";
import { compareValue } from "./auth/passwordHelper";

const prisma = new PrismaClient();

async function checkUser(enrollmentNumber: string, clearText: string) {
  const user = await prisma.user.findFirst({
    where: {
      enrollmentNumber: {
        equals: enrollmentNumber,
        mode: "insensitive",
      },
    },
  });

  if (!user) {
    console.log(`User ${enrollmentNumber} not found in DB.`);
    return;
  }

  const isPasswordValid = await compareValue(clearText, user.passwordHash);
  console.log(`User: ${enrollmentNumber}`);
  console.log(`- Stored hash: ${user.passwordHash}`);
  console.log(`- Clear password tested: "${clearText}"`);
  console.log(`- compareValue result: ${isPasswordValid}`);
}

async function main() {
  console.log("--- TESTING ADMIN AUTH ---");
  await checkUser("karan.mishra@suas.ac.in", "Pilot@2026!");

  console.log("\n--- TESTING STUDENT AUTH ---");
  await checkUser("ENR2026001", "Student@2026!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
