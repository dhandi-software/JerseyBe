const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const [totalCustomer, totalStaff, totalAdmin] = await Promise.all([
            prisma.user.count({ where: { role: 'customer' } }),
            prisma.user.count({ where: { role: { in: ['desain', 'gudang', 'manager'] } } }),
            prisma.user.count({ where: { role: 'admin' } })
        ]);

        const recentMessages = await prisma.message.findMany({
            where: {
                OR: [
                    { sender: { role: 'customer' } },
                    { receiver: { role: 'customer' } }
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { 
                sender: { include: { customer: true } },
                receiver: { include: { customer: true } }
            }
        });

        const recentChattersMap = new Map();
        recentMessages.forEach(msg => {
            if (msg.sender?.customer && !recentChattersMap.has(msg.sender.id)) {
                recentChattersMap.set(msg.sender.id, {
                    id: msg.sender.id,
                    customerId: msg.sender.customer.id,
                    nama: msg.sender.customer.nama,
                    email: msg.sender.email,
                    lastMessageAt: msg.createdAt,
                    category: msg.sender.customer.category || "General Customer"
                });
            }
            if (msg.receiver?.customer && !recentChattersMap.has(msg.receiver.id)) {
                recentChattersMap.set(msg.receiver.id, {
                    id: msg.receiver.id,
                    customerId: msg.receiver.customer.id,
                    nama: msg.receiver.customer.nama,
                    email: msg.receiver.email,
                    lastMessageAt: msg.createdAt,
                    category: msg.receiver.customer.category || "General Customer"
                });
            }
        });

        let recentCustomers = Array.from(recentChattersMap.values()).slice(0, 5);

        if (recentCustomers.length < 5) {
            const latestCustomers = await prisma.customer.findMany({
                where: { userId: { notIn: recentCustomers.map(c => c.id) } },
                include: { user: { select: { id: true, email: true } } },
                orderBy: { id: 'desc' },
                take: 5 - recentCustomers.length
            });
            
            recentCustomers = [...recentCustomers, ...latestCustomers.map(c => ({
                id: c.user.id,
                customerId: c.id,
                nama: c.nama,
                email: c.user.email,
                lastMessageAt: null,
                category: c.category || "New Customer"
            }))];
        }

        const recentChatsData = await prisma.message.findMany({
            orderBy: { createdAt: 'desc' },
            take: 3,
            include: {
                sender: { 
                    select: { 
                        username: true, 
                        role: true, 
                        customer: { select: { nama: true } }, 
                        staff: { select: { nama: true } } 
                    } 
                }
            }
        });

        const recentChats = recentChatsData.map(chat => ({
            id: chat.id,
            content: chat.content || (chat.attachmentUrl ? "📎 Lampiran file" : ""),
            senderName: chat.sender?.customer?.nama || chat.sender?.staff?.nama || chat.sender?.username || "Unknown",
            senderRole: chat.sender?.role,
            createdAt: chat.createdAt,
            isRead: chat.isRead
        }));

        const totalUnreadChat = await prisma.message.count({
            where: { isRead: false, receiverId: { not: null } }
        });

        console.log(JSON.stringify({
            totalCustomer,
            totalStaff,
            totalAdmin,
            recentCustomers,
            recentChats,
            totalUnreadChat
        }, null, 2));

    } catch (error) {
        console.error("Test Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
