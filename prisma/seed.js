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

  // ============================================================
  // 2. Manager
  // ============================================================
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

  // ============================================================
  // 3. Desain
  // ============================================================
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

  // ============================================================
  // 4. Gudang
  // ============================================================
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
        actor: 'Gudang FSCV',
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

  // Order 1: Status MENUNGGU (baru dibuat)
  const order1 = await prisma.jerseyOrder.upsert({
    where: { orderId: 'SEED-ORDER-001' },
    update: {},
    create: {
      orderId: 'SEED-ORDER-001',
      customerId: customerRecord.id,
      status: 'MENUNGGU',
      totalAmount: 1500000,
      designNote: 'Jersey futsal warna biru navy dengan nama tim di punggung. Logo tim di dada kiri.',
      designUrl: null,
      paymentUrl: null,
      designerId: null,
      isWorking: false,
      queueNumber: null,
      designFeedback: null,
      designStatus: 'PENDING',
      mockupUrl: null,
      shippingAddress: null,
      shippingMethod: 'PICKUP',
      recommendedBahanIds: [bahanDriFit.id],
      layoutFeedback: null,
      layoutStatus: 'PENDING',
      layoutUrl: null,
      // Kolom baru
      damagedPcs: 0,
      customerName: 'Joni Kustomer',
      customerPhone: '08123456789',
      finishingUrl: null,
      printUrl: null,
    }
  });

  // Detail Order 1
  await prisma.jerseyOrderDetail.upsert({
    where: { id: 1 },
    update: {},
    create: {
      orderId: order1.id,
      productId: 1,
      productTitle: 'Custom Jersey Futsal Full Printing',
      playerName: 'Budi Santoso',
      playerNumber: '10',
      playerSize: 'L',
    }
  });
  await prisma.jerseyOrderDetail.upsert({
    where: { id: 2 },
    update: {},
    create: {
      orderId: order1.id,
      productId: 1,
      productTitle: 'Custom Jersey Futsal Full Printing',
      playerName: 'Ahmad Fauzi',
      playerNumber: '7',
      playerSize: 'M',
    }
  });

  // Order 2: Status DESAIN (sedang didesain)
  const desainerUser = await prisma.user.findUnique({ where: { email: 'desain@fscv.com' } });

  const order2 = await prisma.jerseyOrder.upsert({
    where: { orderId: 'SEED-ORDER-002' },
    update: {},
    create: {
      orderId: 'SEED-ORDER-002',
      customerId: customerRecord.id,
      status: 'DESAIN',
      totalAmount: 2250000,
      designNote: 'Jersey basket merah putih, nama dan nomor punggung wajib, collar O-neck.',
      designUrl: null,
      paymentUrl: null,
      designerId: desainerUser?.id ?? null,
      isWorking: true,
      queueNumber: 'ANT-002',
      designFeedback: null,
      designStatus: 'SENT',
      mockupUrl: 'https://via.placeholder.com/600x400?text=Mockup+Jersey+Basket',
      shippingAddress: null,
      shippingMethod: 'PICKUP',
      recommendedBahanIds: [bahanHyperMesh.id],
      layoutFeedback: null,
      layoutStatus: 'PENDING',
      layoutUrl: null,
      // Kolom baru
      damagedPcs: 0,
      customerName: 'Joni Kustomer',
      customerPhone: '08123456789',
      finishingUrl: null,
      printUrl: null,
    }
  });

  // Detail Order 2
  await prisma.jerseyOrderDetail.upsert({
    where: { id: 3 },
    update: {},
    create: {
      orderId: order2.id,
      productId: 2,
      productTitle: 'Custom Jersey Basket Full Sublimasi',
      playerName: 'Rian Pratama',
      playerNumber: '23',
      playerSize: 'XL',
    }
  });

  // Order 3: Status SELESAI (contoh order lengkap dengan semua kolom baru terisi)
  const order3 = await prisma.jerseyOrder.upsert({
    where: { orderId: 'SEED-ORDER-003' },
    update: {},
    create: {
      orderId: 'SEED-ORDER-003',
      customerId: customerRecord.id,
      status: 'SELESAI',
      totalAmount: 3600000,
      designNote: 'Jersey sepak bola kombinasi hitam-kuning, full printing sublimasi. Nama sponsor di bahu.',
      designUrl: null,
      paymentUrl: null,
      designerId: desainerUser?.id ?? null,
      isWorking: false,
      queueNumber: 'ANT-001',
      designFeedback: null,
      designStatus: 'APPROVED',
      mockupUrl: 'https://via.placeholder.com/600x400?text=Mockup+Jersey+Bola',
      shippingAddress: 'Jl. Merdeka No. 123, Jakarta Pusat',
      shippingMethod: 'PICKUP',
      recommendedBahanIds: [bahanDriFit.id],
      layoutFeedback: null,
      layoutStatus: 'APPROVED',
      layoutUrl: 'https://via.placeholder.com/600x400?text=Layout+Jersey+Bola',
      // Kolom baru
      damagedPcs: 0,
      customerName: 'Joni Kustomer',
      customerPhone: '08123456789',
      finishingUrl: 'https://via.placeholder.com/600x400?text=Foto+Finishing+Jersey',
      printUrl: 'https://via.placeholder.com/600x400?text=Foto+Print+Jersey',
    }
  });

  // Detail Order 3 (banyak pemain)
  const playersOrder3 = [
    { id: 4, name: 'Sandi Kurnia',  number: '1',  size: 'M' },
    { id: 5, name: 'Dedi Wahyudi', number: '5',  size: 'L' },
    { id: 6, name: 'Rudi Hermawan', number: '8', size: 'XL' },
    { id: 7, name: 'Hendra Putra', number: '11', size: 'M' },
    { id: 8, name: 'Andi Setiawan', number: '17', size: 'L' },
  ];
  for (const player of playersOrder3) {
    await prisma.jerseyOrderDetail.upsert({
      where: { id: player.id },
      update: {},
      create: {
        orderId: order3.id,
        productId: 3,
        productTitle: 'Custom Jersey Sepak Bola Full Sublimasi',
        playerName: player.name,
        playerNumber: player.number,
        playerSize: player.size,
      }
    });
  }

  // Order 4: Status PRINT (foto print sudah ada, finishing belum)
  const order4 = await prisma.jerseyOrder.upsert({
    where: { orderId: 'SEED-ORDER-004' },
    update: {},
    create: {
      orderId: 'SEED-ORDER-004',
      customerId: customerRecord.id,
      status: 'PRINT',
      totalAmount: 1800000,
      designNote: 'Jersey voli warna hijau tosca, nomor punggung besar.',
      designUrl: null,
      paymentUrl: null,
      designerId: desainerUser?.id ?? null,
      isWorking: true,
      queueNumber: 'ANT-003',
      designFeedback: null,
      designStatus: 'APPROVED',
      mockupUrl: 'https://via.placeholder.com/600x400?text=Mockup+Jersey+Voli',
      shippingAddress: null,
      shippingMethod: 'PICKUP',
      recommendedBahanIds: [bahanPolyesterCool.id],
      layoutFeedback: null,
      layoutStatus: 'APPROVED',
      layoutUrl: 'https://via.placeholder.com/600x400?text=Layout+Jersey+Voli',
      // Kolom baru
      damagedPcs: 0,
      customerName: 'Joni Kustomer',
      customerPhone: '08123456789',
      finishingUrl: null,
      printUrl: 'https://via.placeholder.com/600x400?text=Progress+Print+Jersey+Voli',
    }
  });

  // Detail Order 4
  await prisma.jerseyOrderDetail.upsert({
    where: { id: 9 },
    update: {},
    create: {
      orderId: order4.id,
      productId: 4,
      productTitle: 'Custom Jersey Voli Full Printing',
      playerName: 'Siti Rahayu',
      playerNumber: '3',
      playerSize: 'S',
    }
  });

  console.log('Seeding finished.');
  console.log('');
  console.log('== Akun tersedia ==');
  console.log('Admin    : admin@fscv.com      / password123');
  console.log('Manager  : manager@fscv.com    / password123');
  console.log('Desain   : desain@fscv.com     / password123');
  console.log('Gudang   : gudang@fscv.com     / password123');
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
