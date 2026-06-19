const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Hash for 'password123'
  const passwordHash = '$2b$10$8wKYGAAlFsLB7BRcDYjUfuPUK67Luih/jq3FYijMlh2YT.j5.4P4W';

  // Cleanup existing data to avoid conflicts
  await prisma.message.deleteMany();
  await prisma.chatRoomMember.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.user.deleteMany();

  // 1. Admin
  await prisma.user.upsert({
    where: { email: 'admin@fscv.com' },
    update: {
      username: 'admin',
      role: 'admin',
      password: passwordHash,
    },
    create: {
      username: 'admin',
      email: 'admin@fscv.com',
      password: passwordHash,
      role: 'admin',
      staff: {
        create: {
            nama: 'Staff FSCV',
            position: 'Admin'
        }
      }
    },
  });

  // 2. Manager
  await prisma.user.upsert({
    where: { email: 'manager@fscv.com' },
    update: {
      username: 'manager',
      role: 'manager',
      password: passwordHash,
    },
    create: {
      username: 'manager',
      email: 'manager@fscv.com',
      password: passwordHash,
      role: 'manager',
      staff: {
        create: {
            nama: 'Budi Manager',
            position: 'Manager'
        }
      }
    },
  });

  // 3. Desain
  await prisma.user.upsert({
    where: { email: 'desain@fscv.com' },
    update: {
      username: 'desain',
      role: 'desain',
      password: passwordHash,
    },
    create: {
      username: 'desain',
      email: 'desain@fscv.com',
      password: passwordHash,
      role: 'desain',
      staff: {
        create: {
            nama: 'Dhandi Designer',
            position: 'Designer'
        }
      }
    },
  });

  // 4. Gudang
  await prisma.user.upsert({
    where: { email: 'gudang@fscv.com' },
    update: {
      username: 'gudang',
      role: 'gudang',
      password: passwordHash,
    },
    create: {
      username: 'gudang',
      email: 'gudang@fscv.com',
      password: passwordHash,
      role: 'gudang',
      staff: {
        create: {
            nama: 'Gudang FSCV',
            position: 'Warehouse'
        }
      }
    },
  });

  // 5. Customer
  await prisma.user.upsert({
    where: { email: 'customer@gmail.com' },
    update: {
      username: 'customer',
      role: 'customer',
      password: passwordHash,
    },
    create: {
      username: 'customer',
      email: 'customer@gmail.com',
      password: passwordHash,
      role: 'customer',
      customer: {
        create: {
            nama: 'Joni Kustomer',
            category: 'Futsal',
            phone: '08123456789',
            address: 'Jl. Merdeka No. 123, Jakarta',
            memberSince: '2026'
        }
      }
    },
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
