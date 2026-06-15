const prisma = require('../prisma');

exports.uploadAttachment = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ 
        url: fileUrl, 
        name: req.file.originalname,
        type: req.file.mimetype 
    });
};

exports.getChatHistory = async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;
        
        let whereClause;
        if (otherUserId === 'public') {
            whereClause = { 
                isPublic: true,
                NOT: { deletedBy: { some: { id: parseInt(userId) } } }
            };
        } else if (otherUserId.startsWith('group_')) {
            const roomId = parseInt(otherUserId.split('_')[1]);
            whereClause = {
                roomId: roomId,
                NOT: { deletedBy: { some: { id: parseInt(userId) } } }
            };
        } else {
            whereClause = {
                roomId: null,
                OR: [
                    { senderId: parseInt(userId), receiverId: parseInt(otherUserId) },
                    { senderId: parseInt(otherUserId), receiverId: parseInt(userId) }
                ],
                NOT: { deletedBy: { some: { id: parseInt(userId) } } }
            };
        }

        const messages = await prisma.message.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'asc'
            },
            include: {
                sender: { select: { username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } },
                receiver: { select: { username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } },
                parent: {
                    select: {
                        id: true,
                        content: true,
                        sender: { select: { username: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } }
                    }
                }
            }
        });

        const formattedMessages = messages.map(msg => {
            const formatName = (userObj) => userObj?.customer?.nama || userObj?.staff?.nama || userObj?.username;
            return {
                ...msg,
                sender: msg.sender ? { ...msg.sender, username: formatName(msg.sender) } : null,
                receiver: msg.receiver ? { ...msg.receiver, username: formatName(msg.receiver) } : null,
                parent: msg.parent ? { ...msg.parent, sender: { ...msg.parent.sender, username: formatName(msg.parent.sender) } } : null
            };
        });

        res.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getContacts = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log("Fetching contacts for user:", userId);
        
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });

        const isCustomer = currentUser?.role === 'customer';

        const users = await prisma.user.findMany({
            where: {
                id: { not: userId },
                ...(isCustomer ? { role: 'desain' } : {})
            },
            select: {
                id: true,
                username: true,
                role: true,
                email: true,
                customer: { select: { nama: true } },
                staff:     { select: { nama: true } }
            }
        });

        const formattedUsers = users.map(u => ({
            id: u.id,
            username: u.customer?.nama || u.staff?.nama || u.username,
            role: u.role,
            email: u.email
        }));

        const rooms = await prisma.chatRoom.findMany({
            where: { members: { some: { userId: userId } } },
            include: { 
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                role: true,
                                customer: { select: { nama: true } },
                                staff: { select: { nama: true } }
                            }
                        }
                    }
                }
            }
        });

        const formattedRooms = rooms.map(r => ({
            id: `group_${r.id}`,
            realId: r.id,
            username: r.name,
            role: "group",
            isGroup: true,
            adminId: r.adminId,
            members: r.members.map(m => ({
                id: m.user.id,
                username: m.user.customer?.nama || m.user.staff?.nama || m.user.username,
                role: m.user.role
            }))
        }));

        const allContacts = [...formattedUsers, ...formattedRooms];

        const messages = await prisma.message.findMany({
             where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId },
                    { isPublic: true },
                    { roomId: { in: rooms.map(r => r.id) } }
                ]
             },
             orderBy: { createdAt: 'desc' },
        });

        const contactsWithLastMessage = allContacts.map(contact => {
            let lastMsg;
            let unreadCount = 0;
            if (contact.isGroup) {
                const groupMsgs = messages.filter(m => m.roomId === contact.realId);
                lastMsg = groupMsgs[0];
                unreadCount = groupMsgs.filter(m => m.senderId !== userId && (!m.readByIds || !m.readByIds.includes(userId))).length;
            } else {
                const dmMsgs = messages.filter(m => 
                    !m.isPublic && !m.roomId && (
                        (m.senderId === userId && m.receiverId === contact.id) || 
                        (m.senderId === contact.id && m.receiverId === userId)
                    )
                );
                lastMsg = dmMsgs[0];
                unreadCount = dmMsgs.filter(m => m.senderId === contact.id && m.receiverId === userId && !m.isRead).length;
            }
            return { ...contact, lastMessage: lastMsg, unreadCount };
        });
        
        const publicMsgs = messages.filter(m => m.isPublic);
        const lastPublicMessage = publicMsgs[0];
        const publicUnreadCount = publicMsgs.filter(m => m.senderId !== userId && (!m.readByIds || !m.readByIds.includes(userId))).length;
        
        res.json({
            users: contactsWithLastMessage,
            lastPublicMessage,
            publicUnreadCount
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        const directCount = await prisma.message.count({
            where: {
                receiverId: userId,
                isRead: false,
                roomId: null,
                isPublic: false
            }
        });

        const groupCount = await prisma.message.count({
            where: {
                roomId: { not: null },
                room: { members: { some: { userId: userId } } },
                senderId: { not: userId },
                NOT: { readByIds: { has: userId } }
            }
        });

        const publicCount = await prisma.message.count({
            where: {
                isPublic: true,
                senderId: { not: userId },
                NOT: { readByIds: { has: userId } }
            }
        });

        res.json({ count: directCount + groupCount + publicCount });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
