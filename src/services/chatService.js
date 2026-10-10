const prisma = require('../config/prisma');
const chatRepository = require('../repositories/chatRepository');

const uploadAttachment = (file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    return {
        url: `/uploads/${file.filename}`,
        name: file.originalname,
        type: file.mimetype
    };
};

const getChatHistory = async (userId, otherUserId) => {
    const uid = parseInt(userId);
    let whereClause;

    if (otherUserId === 'public') {
        whereClause = {
            isPublic: true,
            NOT: { deletedBy: { some: { id: uid } } }
        };
    } else if (otherUserId.startsWith('group_')) {
        const roomId = parseInt(otherUserId.split('_')[1]);
        whereClause = {
            roomId,
            NOT: { deletedBy: { some: { id: uid } } }
        };
    } else {
        const otherId = parseInt(otherUserId);
        whereClause = {
            roomId: null,
            OR: [
                { senderId: uid, receiverId: otherId },
                { senderId: otherId, receiverId: uid }
            ],
            NOT: { deletedBy: { some: { id: uid } } }
        };
    }

    const messages = await chatRepository.findMessages(whereClause, {
        sender: { select: { username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } },
        receiver: { select: { username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } },
        parent: {
            select: {
                id: true,
                content: true,
                sender: { select: { username: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } }
            }
        }
    }, { createdAt: 'asc' });

    const formatName = (userObj) => userObj?.customer?.nama || userObj?.staff?.nama || userObj?.username;

    return messages.map(msg => ({
        ...msg,
        sender: msg.sender ? { ...msg.sender, username: formatName(msg.sender) } : null,
        receiver: msg.receiver ? { ...msg.receiver, username: formatName(msg.receiver) } : null,
        parent: msg.parent ? { ...msg.parent, sender: { ...msg.parent.sender, username: formatName(msg.parent.sender) } } : null
    }));
};

const getContacts = async (userId) => {
    const uid = parseInt(userId);

    const currentUser = await prisma.user.findUnique({
        where: { id: uid },
        select: { role: true }
    });

    const isCustomer = currentUser?.role === 'customer';

    const users = await prisma.user.findMany({
        where: {
            id: { not: uid },
            ...(isCustomer ? { role: { in: ['desain', 'gudang', 'admin'] } } : {})
        },
        select: {
            id: true,
            username: true,
            role: true,
            email: true,
            customer: { select: { nama: true } },
            staff: { select: { nama: true } }
        }
    });

    const formattedUsers = users.map(u => ({
        id: u.id,
        username: u.customer?.nama || u.staff?.nama || u.username,
        role: u.role,
        email: u.email
    }));

    const rooms = await chatRepository.findChatRooms(
        { members: { some: { userId: uid } } },
        {
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
    );

    const formattedRooms = rooms.map(r => ({
        id: `group_${r.id}`,
        realId: r.id,
        username: r.name,
        role: 'group',
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
                { senderId: uid },
                { receiverId: uid },
                { isPublic: true },
                { roomId: { in: rooms.map(r => r.id) } }
            ]
        },
        orderBy: { createdAt: 'desc' }
    });

    const contactsWithLastMessage = allContacts.map(contact => {
        let lastMsg;
        let unreadCount = 0;
        if (contact.isGroup) {
            const groupMsgs = messages.filter(m => m.roomId === contact.realId);
            lastMsg = groupMsgs[0];
            unreadCount = groupMsgs.filter(m => m.senderId !== uid && (!m.readByIds || !m.readByIds.includes(uid))).length;
        } else {
            const dmMsgs = messages.filter(m =>
                !m.isPublic && !m.roomId && (
                    (m.senderId === uid && m.receiverId === contact.id) ||
                    (m.senderId === contact.id && m.receiverId === uid)
                )
            );
            lastMsg = dmMsgs[0];
            unreadCount = dmMsgs.filter(m => m.senderId === contact.id && m.receiverId === uid && !m.isRead).length;
        }
        return { ...contact, lastMessage: lastMsg, unreadCount };
    });

    const publicMsgs = messages.filter(m => m.isPublic);
    const lastPublicMessage = publicMsgs[0];
    const publicUnreadCount = publicMsgs.filter(m => m.senderId !== uid && (!m.readByIds || !m.readByIds.includes(uid))).length;

    return {
        users: contactsWithLastMessage,
        lastPublicMessage,
        publicUnreadCount
    };
};

const getUnreadCount = async (userId) => {
    const uid = parseInt(userId);

    const directCount = await prisma.message.count({
        where: {
            receiverId: uid,
            isRead: false,
            roomId: null,
            isPublic: false
        }
    });

    const groupCount = await prisma.message.count({
        where: {
            roomId: { not: null },
            room: { members: { some: { userId: uid } } },
            senderId: { not: uid },
            NOT: { readByIds: { has: uid } }
        }
    });

    const publicCount = await prisma.message.count({
        where: {
            isPublic: true,
            senderId: { not: uid },
            NOT: { readByIds: { has: uid } }
        }
    });

    return { count: directCount + groupCount + publicCount };
};

const createGroup = async ({ name, memberIds, adminId }) => {
    if (!name || !memberIds || !adminId) {
        const error = new Error('Missing required fields: name, memberIds, adminId');
        error.statusCode = 400;
        throw error;
    }

    const adminIdParsed = parseInt(adminId);
    if (isNaN(adminIdParsed)) {
        const error = new Error('Invalid adminId format.');
        error.statusCode = 400;
        throw error;
    }

    const adminUser = await prisma.user.findUnique({ where: { id: adminIdParsed } });
    const allowedRoles = ['manager', 'admin'];
    if (!adminUser || !allowedRoles.includes(adminUser.role.toLowerCase())) {
        const error = new Error('Hanya Manager atau Admin yang dapat membuat grup.');
        error.statusCode = 403;
        throw error;
    }

    const validatedMemberIds = memberIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    const allMemberIds = [...new Set([...validatedMemberIds, adminIdParsed])];

    const chatRoom = await chatRepository.createChatRoom({
        name,
        adminId: adminIdParsed,
        isGroup: true,
        members: {
            create: allMemberIds.map(id => ({ userId: id }))
        }
    }, {
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
    });

    return {
        id: `group_${chatRoom.id}`,
        realId: chatRoom.id,
        username: chatRoom.name,
        role: 'group',
        isGroup: true,
        adminId: chatRoom.adminId,
        members: chatRoom.members.map(m => ({
            id: m.user.id,
            username: m.user.customer?.nama || m.user.staff?.nama || m.user.username,
            role: m.user.role
        }))
    };
};

const addMembers = async (roomId, memberIds, adminId) => {
    const rId = parseInt(roomId);
    const aId = parseInt(adminId);

    if (isNaN(rId) || !memberIds || isNaN(aId)) {
        const error = new Error('Missing required fields: roomId, memberIds, adminId');
        error.statusCode = 400;
        throw error;
    }

    const room = await chatRepository.findChatRoomById(rId);
    if (!room || room.adminId !== aId) {
        const error = new Error('Only the group admin can add members.');
        error.statusCode = 403;
        throw error;
    }

    const validatedMemberIds = memberIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    const existingMembers = await chatRepository.findChatRoomMembers({ roomId: rId });
    const existingMemberIds = existingMembers.map(m => m.userId);
    const newMemberIds = validatedMemberIds.filter(id => !existingMemberIds.includes(id));

    if (newMemberIds.length > 0) {
        await chatRepository.addChatRoomMembers(rId, newMemberIds);
    }

    const updatedRoom = await chatRepository.findChatRoomById(rId, {
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
    });

    return {
        id: `group_${updatedRoom.id}`,
        realId: updatedRoom.id,
        username: updatedRoom.name,
        role: 'group',
        isGroup: true,
        adminId: updatedRoom.adminId,
        members: updatedRoom.members.map(m => ({
            id: m.user.id,
            username: m.user.customer?.nama || m.user.staff?.nama || m.user.username,
            role: m.user.role
        }))
    };
};

const removeMember = async (roomId, userId, adminId, io = null) => {
    const rId = parseInt(roomId);
    const uId = parseInt(userId);
    const aId = parseInt(adminId);

    if (isNaN(rId) || isNaN(uId) || isNaN(aId)) {
        const error = new Error('Missing required fields: roomId, userId, adminId');
        error.statusCode = 400;
        throw error;
    }

    const room = await chatRepository.findChatRoomById(rId);
    if (!room || room.adminId !== aId) {
        const error = new Error('Only the group admin can remove members.');
        error.statusCode = 403;
        throw error;
    }

    if (aId === uId) {
        const error = new Error('Admin cannot remove themselves from the group.');
        error.statusCode = 400;
        throw error;
    }

    await chatRepository.removeChatRoomMember(rId, uId);

    const updatedRoom = await chatRepository.findChatRoomById(rId, {
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
    });

    const formattedRoom = {
        id: `group_${updatedRoom.id}`,
        realId: updatedRoom.id,
        username: updatedRoom.name,
        role: 'group',
        isGroup: true,
        adminId: updatedRoom.adminId,
        members: updatedRoom.members.map(m => ({
            id: m.user.id,
            username: m.user.customer?.nama || m.user.staff?.nama || m.user.username,
            role: m.user.role
        }))
    };

    if (io) {
        io.to(`user_${uId}`).emit('group_member_removed', { groupId: rId });
    }

    return formattedRoom;
};

const deleteGroup = async (roomId, adminId, io = null) => {
    const rId = parseInt(roomId);
    const aId = parseInt(adminId);

    if (isNaN(rId) || isNaN(aId)) {
        const error = new Error('Missing required fields: roomId, adminId');
        error.statusCode = 400;
        throw error;
    }

    const room = await chatRepository.findChatRoomById(rId, { members: true });
    if (!room || room.adminId !== aId) {
        const error = new Error('Only the group admin can delete the group.');
        error.statusCode = 403;
        throw error;
    }

    if (io) {
        room.members.forEach(member => {
            if (member.userId !== aId) {
                io.to(`user_${member.userId}`).emit('group_deleted', { groupId: rId });
            }
        });
    }

    await prisma.$transaction([
        prisma.message.deleteMany({ where: { roomId: rId } }),
        prisma.chatRoom.delete({ where: { id: rId } })
    ]);

    return { message: 'Group deleted successfully', roomId: rId };
};

module.exports = {
    uploadAttachment,
    getChatHistory,
    getContacts,
    getUnreadCount,
    createGroup,
    addMembers,
    removeMember,
    deleteGroup
};
