const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Hash for 'password123'
  const passwordHash = '$2b$10$8wKYGAAlFsLB7BRcDYjUfuPUK67Luih/jq3FYijMlh2YT.j5.4P4W';

  // Cleanup existing data to avoid conflicts (DISABLED TO PREVENT DATA LOSS)
  // await prisma.message.deleteMany();
  // await prisma.chatRoomMember.deleteMany();
  // await prisma.chatRoom.deleteMany();
  // await prisma.customer.deleteMany();
  // await prisma.staff.deleteMany();
  // await prisma.user.deleteMany();

  // ============================================================
  // 1. Admin
  // ============================================================
  await prisma.user.upsert({
    where: { email: 'admin@fcsv.com' },
    update: {
      username: 'admin',
      role: 'admin',
      password: passwordHash,
    },
    create: {
      username: 'admin',
      email: 'admin@fcsv.com',
      password: passwordHash,
      role: 'admin',
      staff: {
        create: {
            nama: 'Staff FCSV',
            position: 'Admin'
        }
      }
    },
  });

  // ============================================================
  // 2. Manager
  // ============================================================
  await prisma.user.upsert({
    where: { email: 'manager@fcsv.com' },
    update: {
      username: 'manager',
      role: 'manager',
      password: passwordHash,
    },
    create: {
      username: 'manager',
      email: 'manager@fcsv.com',
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

  // ============================================================
  // 3. Desain
  // ============================================================
  await prisma.user.upsert({
    where: { email: 'desain@fcsv.com' },
    update: {
      username: 'desain',
      role: 'desain',
      password: passwordHash,
    },
    create: {
      username: 'desain',
      email: 'desain@fcsv.com',
      password: passwordHash,
      role: 'desain',
      staff: {
        create: {
            nama: 'Bayu Designer',
            position: 'Designer'
        }
      }
    },
  });

  // ============================================================
  // 4. Gudang
  // ============================================================
  await prisma.user.upsert({
    where: { email: 'gudang@fcsv.com' },
    update: {
      username: 'gudang',
      role: 'gudang',
      password: passwordHash,
    },
    create: {
      username: 'gudang',
      email: 'gudang@fcsv.com',
      password: passwordHash,
      role: 'gudang',
      staff: {
        create: {
            nama: 'Gudang FCSV',
            position: 'Warehouse'
        }
      }
    },
  });

  // ============================================================
  // 5. Customer
  // ============================================================
  const customerUser = await prisma.user.upsert({
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

  // Ambil data customer
  const customerRecord = await prisma.customer.findUnique({
    where: { userId: customerUser.id }
  });

  if (!customerRecord) {
    console.log('Customer record not found, skip seeding JerseyOrder.');
    console.log('Seeding finished.');
    return;
  }

  // ============================================================
  // 6. BahanBaju (Kain Jersey)
  //    Data bahan baju hanya berasal dari input Admin / Gudang.
  //    Dummy seed bahan baju dihapus agar katalog menampilkan
  //    empty state ketika admin belum menambahkan produk.
  // ============================================================
  await prisma.bahanBaju.deleteMany({
    where: {
      imageUrl: null,
      nama: {
        in: ['Dri-Fit Premium', 'Hyper Mesh', 'Polyester Cool-Tech'],
      },
    },
  });

  // ============================================================
  // 7. Seed JerseyOrder
  //    NOTE: Dummy orders (SEED-ORDER-*) have been removed to prevent fake transaction data.
  //    Real orders will be created via user transactions.
  // ============================================================

  console.log('Seeding finished.');
  console.log('');
  console.log('== Akun tersedia ==');
  console.log('Admin    : admin@fcsv.com      / password123');
  console.log('Manager  : manager@fcsv.com    / password123');
  console.log('Desain   : desain@fcsv.com     / password123');
  console.log('Gudang   : gudang@fcsv.com     / password123');
  console.log('Customer : customer@gmail.com  / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
