import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users in the database:`);
  for (const user of users) {
    console.log(`- Enrollment/Email: ${user.enrollmentNumber}`);
    console.log(`  Name: ${user.fullName}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  IsActive: ${user.isActive}`);
    console.log(`  MustChangePassword: ${user.mustChangePassword}`);
    console.log(`  PasswordHash exists: ${!!user.passwordHash}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
