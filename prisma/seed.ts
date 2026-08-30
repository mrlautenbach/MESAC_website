// Creates the first admin account. Safe to run multiple times (it won't
// duplicate the admin if it already exists). Run with `npm run db:seed`.
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = process.env.SEED_ADMIN_NAME ?? "League Admin";

  if (!email || !password) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running the seed script.");
  }
  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin account for ${email} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      mustChangePassword: true,
    },
  });

  console.log(`Created admin account for ${email}. Log in and change the password immediately.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
