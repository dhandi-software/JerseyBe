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
  // 6. Seed BahanBaju (Kain Jersey)
  //    Mencakup semua kolom: nama, deskripsi, imageUrl, harga,
  //    kuantitasKg, rasioKonversi, status, buktiNotaUrl, hargaBeli
  // ============================================================
  const bahanDriFit = await prisma.bahanBaju.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nama: 'Dri-Fit Premium',
      deskripsi: 'Bahan jersey dri-fit berkualitas tinggi, ringan dan cepat menyerap keringat. Cocok untuk futsal dan sepak bola.',
      kuantitasKg: 50.0,
      rasioKonversi: 1.2,
      status: 'Tersedia',
      harga: 85000,
      hargaBeli: 60000,
      buktiNotaUrl: null,
      imageUrl: null,
    }
  });

  const bahanHyperMesh = await prisma.bahanBaju.upsert({
    where: { id: 2 },
    update: {},
    create: {
      nama: 'Hyper Mesh',
      deskripsi: 'Bahan mesh berlubang mikro yang sangat breathable. Ideal untuk jersey lari dan basket.',
      kuantitasKg: 30.0,
      rasioKonversi: 1.0,
      status: 'Tersedia',
      harga: 95000,
      hargaBeli: 70000,
      buktiNotaUrl: null,
      imageUrl: null,
    }
  });

  const bahanPolyesterCool = await prisma.bahanBaju.upsert({
    where: { id: 3 },
    update: {},
    create: {
      nama: 'Polyester Cool-Tech',
      deskripsi: 'Bahan polyester teknologi cool-tech, menjaga suhu tubuh tetap sejuk saat bermain.',
      kuantitasKg: 20.0,
      rasioKonversi: 1.1,
      status: 'Menipis',
      harga: 75000,
      hargaBeli: 55000,
      buktiNotaUrl: null,
      imageUrl: null,
    }
  });

  // ============================================================
  // 7. Seed BahanBajuHistory
  //    Mencakup semua kolom baru: customerName, orderId, pcs
  //    serta kolom lama: aksi, jumlah, stokAkhir, keterangan,
  //    actor, hargaBeli, hargaJual, totalNilai, namaBahan
  // ============================================================
  await prisma.bahanBajuHistory.createMany({
    skipDuplicates: true,
    data: [
      // Penambahan stok awal Dri-Fit
      {
        bahanId: bahanDriFit.id,
        namaBahan: bahanDriFit.nama,
        aksi: 'TAMBAH_STOK',
        jumlah: 50.0,
        stokAkhir: 50.0,
        keterangan: 'Pengadaan stok awal bahan Dri-Fit Premium',
        actor: 'Admin',
        hargaBeli: 60000,
        hargaJual: null,
        totalNilai: 3000000,
        customerName: null,
        orderId: null,
        pcs: null,
      },
      // Penambahan stok awal Hyper Mesh
      {
        bahanId: bahanHyperMesh.id,
        namaBahan: bahanHyperMesh.nama,
        aksi: 'TAMBAH_STOK',
        jumlah: 30.0,
        stokAkhir: 30.0,
        keterangan: 'Pengadaan stok awal bahan Hyper Mesh',
        actor: 'Admin',
        hargaBeli: 70000,
        hargaJual: null,
        totalNilai: 2100000,
        customerName: null,
        orderId: null,
        pcs: null,
      },
      // Penggunaan bahan Dri-Fit untuk pesanan (contoh pemakaian dengan kolom baru)
      {
        bahanId: bahanDriFit.id,
        namaBahan: bahanDriFit.nama,
        aksi: 'PEMAKAIAN',
        jumlah: 2.4,
        stokAkhir: 47.6,
        keterangan: 'Pemakaian bahan untuk order jersey futsal 2 set (12 pcs)',
        actor: 'Gudang FCSV',
        hargaBeli: 60000,
        hargaJual: 85000,
        totalNilai: 204000,
        customerName: 'Joni Kustomer',  // kolom baru
        orderId: null,                   // akan diisi setelah order dibuat
        pcs: 12,                         // kolom baru
      },
    ]
  });

  // ============================================================
  // 8. Seed JerseyOrder
  //    Mencakup SEMUA kolom termasuk yang baru:
  //    - damagedPcs (Int, default 0)
  //    - customerName (String?)
  //    - customerPhone (String?)
  //    - finishingUrl (String?)
  //    - printUrl (String?)
  // ============================================================

  // NOTE: Dummy orders (SEED-ORDER-*) have been removed to prevent fake transaction data.
  // Real orders will be created via user transactions.

  console.log('Seeding finished.');
  console.log('');
  console.log('== Akun tersedia ==');
  console.log('Admin    : admin@fcsv.com      / password123');
  console.log('Manager  : manager@fcsv.com    / password123');
  console.log('Desain   : desain@fcsv.com     / password123');
  console.log('Gudang   : gudang@fcsv.com     / password123');
  console.log('Customer : customer@gmail.com  / password123');
  console.log('');
  console.log('== Kolom baru yang sudah diseed ==');
  console.log('JerseyOrder   : damagedPcs, customerName, customerPhone, finishingUrl, printUrl');
  console.log('BahanBajuHistory : customerName, orderId, pcs');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
