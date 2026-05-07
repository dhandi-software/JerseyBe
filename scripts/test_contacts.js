const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userId = 35; // Admin
    try {
        const users = await prisma.user.findMany({
            where: { id: { not: userId } },
            select: { id: true, username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } }
        });

        const allDms = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ],
                roomId: null,
                isPublic: false
            },
            orderBy: { createdAt: 'desc' }
        });

        const contactsWithLastMessage = users.map(u => {
            const dmMsgs = allDms.filter(m => 
                (m.senderId === u.id && m.receiverId === userId) ||
                (m.senderId === userId && m.receiverId === u.id)
            );
            
            return {
                id: u.id,
                username: u.customer?.nama || u.staff?.nama || u.username,
                lastMessage: dmMsgs[0],
                unreadCount: dmMsgs.filter(m => m.receiverId === userId && !m.isRead).length
            };
        });

        console.log(JSON.stringify(contactsWithLastMessage, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
