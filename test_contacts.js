const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testGetContacts(userId) {
    // This replicates the logic now in chatController.js
    const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
    });

    const isCustomer = currentUser?.role === 'customer';

    const users = await prisma.user.findMany({
        where: {
            id: { not: userId },
            ...(isCustomer ? { role: { not: 'customer' } } : {})
        },
        select: {
            id: true,
            username: true,
            role: true,
            mahasiswa: { select: { nama: true } },
            dosen: { select: { nama: true } }
        }
    });

    const formattedUsers = users.map(u => ({
        id: u.id,
        username: u.mahasiswa?.nama || u.dosen?.nama || u.username,
        role: u.role
    }));

    console.log(`\nContacts for User ${userId} (${currentUser?.role}):`);
    console.log(JSON.stringify(formattedUsers, null, 2));
    
    if (isCustomer) {
        const otherCustomers = formattedUsers.filter(u => u.role === 'customer');
        if (otherCustomers.length > 0) {
            console.error("FAILED: Customer see other customers!", otherCustomers);
        } else {
            console.log("SUCCESS: Customer does not see other customers.");
        }
    }
}

async function runTests() {
    await testGetContacts(18); // Vira (Customer)
    await testGetContacts(1);  // Admin
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
