const prisma = require('../config/prisma');

const createMessage = async (data, include = null) => {
    const query = { data };
    if (include) query.include = include;
    return await prisma.message.create(query);
};

const findMessages = async (where, include = null, orderBy = { createdAt: 'asc' }) => {
    const query = { where, orderBy };
    if (include) query.include = include;
    return await prisma.message.findMany(query);
};

const countMessages = async (where) => {
    return await prisma.message.count({ where });
};

const findChatRooms = async (where, include = null) => {
    const query = { where };
    if (include) query.include = include;
    return await prisma.chatRoom.findMany(query);
};

const findChatRoomById = async (id, include = null) => {
    const query = { where: { id: parseInt(id) } };
    if (include) query.include = include;
    return await prisma.chatRoom.findUnique(query);
};

const createChatRoom = async (data, include = null) => {
    const query = { data };
    if (include) query.include = include;
    return await prisma.chatRoom.create(query);
};

const deleteChatRoom = async (id) => {
    return await prisma.chatRoom.delete({
        where: { id: parseInt(id) }
    });
};

const findChatRoomMembers = async (where) => {
    return await prisma.chatRoomMember.findMany({ where });
};

const addChatRoomMembers = async (roomId, userIds) => {
    return await prisma.chatRoomMember.createMany({
        data: userIds.map(userId => ({
            roomId: parseInt(roomId),
            userId: parseInt(userId)
        }))
    });
};

const removeChatRoomMember = async (roomId, userId) => {
    return await prisma.chatRoomMember.deleteMany({
        where: {
            roomId: parseInt(roomId),
            userId: parseInt(userId)
        }
    });
};

module.exports = {
    createMessage,
    findMessages,
    countMessages,
    findChatRooms,
    findChatRoomById,
    createChatRoom,
    deleteChatRoom,
    findChatRoomMembers,
    addChatRoomMembers,
    removeChatRoomMember
};
