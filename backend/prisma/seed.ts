import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@acs.local' } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
    await prisma.user.create({
      data: {
        email: 'admin@acs.local',
        passwordHash,
        name: 'ACS Admin',
        role: 'admin',
      },
    });
    console.log('Created default admin user: admin@acs.local / ChangeMe123!');
  } else {
    console.log('Admin user already exists — skipping seed.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
