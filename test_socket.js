const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function simulateSendMessage(senderId, receiverId) {
    console.log(`\nSimulating send_message from ${senderId} to ${receiverId}`);
    
    // Logic from socket/index.js
    const [sender, receiver] = await Promise.all([
        prisma.user.findUnique({ where: { id: senderId }, select: { role: true } }),
        prisma.user.findUnique({ where: { id: receiverId }, select: { role: true } })
    ]);

    if (sender?.role === 'customer' && receiver?.role === 'customer') {
        console.log(`RESULT: BLOCKED (Correct) - Both are customers.`);
        return false;
    } else {
        console.log(`RESULT: ALLOWED (Correct) - Sender: ${sender?.role}, Receiver: ${receiver?.role}`);
        return true;
    }
}

async function runTests() {
    await simulateSendMessage(18, 14); // Customer to Customer (Vira to Tester)
    await simulateSendMessage(18, 1);  // Customer to Admin
    await simulateSendMessage(1, 18);  // Admin to Customer
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
