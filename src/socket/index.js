const prisma = require('../prisma');
const { verifyTokenAndGetUser } = require('../middleware/authMiddleware');

const INTERNAL_STAFF_ROLES = ['admin', 'manager', 'desain', 'gudang'];

const extractTokenFromHandshake = (handshake) => {
  if (handshake?.auth?.token) {
    return handshake.auth.token;
  }
  const authHeader = handshake?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = handshake?.headers?.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    const cookies = cookieHeader.split(';');
    for (const part of cookies) {
      const [rawKey, ...rawVal] = part.trim().split('=');
      if (rawKey === 'token' && rawVal.length > 0) {
        return decodeURIComponent(rawVal.join('='));
      }
    }
  }
  return null;
};

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = extractTokenFromHandshake(socket.handshake);
      const user = await verifyTokenAndGetUser(token);
      if (!user) {
        return next(new Error('Unauthorized socket connection'));
      }
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Unauthorized socket connection'));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedUser = socket.user;
    if (!authenticatedUser) {
      socket.disconnect(true);
      return;
    }

    socket.on('join', async () => {
      const uid = authenticatedUser.id;
      const userRole = (authenticatedUser.role || '').toLowerCase();
      socket.join(`user_${uid}`);

      if (INTERNAL_STAFF_ROLES.includes(userRole)) {
        socket.join('public_room');
      }

      try {
        const userRooms = await prisma.chatRoom.findMany({
          where: { members: { some: { userId: uid } } }
        });
        userRooms.forEach((room) => {
          socket.join(`room_${room.id}`);
        });
      } catch (err) {
        console.error('Error joining group rooms on socket:', err);
      }
    });

    socket.on('send_message', async (data) => {
      const { receiverId, roomId, content, attachmentUrl, attachmentName, attachmentType, isPublic, replyToId } = data || {};
      const senderId = authenticatedUser.id;
      const senderRole = (authenticatedUser.role || '').toLowerCase();

      try {
        if (isPublic && !INTERNAL_STAFF_ROLES.includes(senderRole)) {
          return socket.emit('error', { message: 'Forbidden: Hanya tim internal yang dapat mengirim pesan ke ruang publik.' });
        }

        if (roomId) {
          const rid = parseInt(roomId, 10);
          const isMember = await prisma.chatRoomMember.findFirst({
            where: { roomId: rid, userId: senderId }
          });
          if (!isMember) {
            return socket.emit('error', { message: 'Forbidden: Anda bukan anggota grup ini.' });
          }
        } else if (!isPublic && receiverId) {
          const receiver = await prisma.user.findUnique({
            where: { id: parseInt(receiverId, 10) },
            select: { role: true }
          });

          if (senderRole === 'customer' && receiver?.role?.toLowerCase() === 'customer') {
            return socket.emit('error', { message: 'Customers are not allowed to chat with each other.' });
          }
        }

        const messageData = {
          senderId,
          content,
          attachmentUrl,
          attachmentName,
          attachmentType,
          isPublic: Boolean(isPublic),
          replyToId: replyToId ? parseInt(replyToId, 10) : null
        };

        if (roomId) {
          messageData.roomId = parseInt(roomId, 10);
        } else if (!isPublic && receiverId) {
          messageData.receiverId = parseInt(receiverId, 10);
        }

        const message = await prisma.message.create({
          data: messageData,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                role: true,
                customer: { select: { nama: true } },
                staff: { select: { nama: true } }
              }
            },
            receiver: {
              select: {
                id: true,
                username: true,
                role: true,
                customer: { select: { nama: true } },
                staff: { select: { nama: true } }
              }
            },
            parent: {
              select: {
                id: true,
                content: true,
                sender: { select: { username: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } }
              }
            },
            room: {
              include: {
                members: true
              }
            }
          }
        });

        if (message.sender) {
          const fullName = message.sender.customer?.nama || message.sender.staff?.nama || message.sender.username;
          message.sender.username = fullName;
        }

        if (isPublic) {
          io.to('public_room').emit('receive_message', message);
        } else if (roomId) {
          const rid = parseInt(roomId, 10);
          socket.to(`room_${rid}`).emit('receive_message', message);
          socket.emit('message_sent', message);
        } else {
          io.to(`user_${receiverId}`).emit('receive_message', message);
          socket.emit('message_sent', message);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('mark_read', async ({ conversationWithId, roomId, isPublic } = {}) => {
      try {
        const uid = authenticatedUser.id;
        if (isPublic) {
          await prisma.$executeRaw`
            UPDATE "Message" 
            SET "readByIds" = array_append("readByIds", ${uid}) 
            WHERE "isPublic" = true 
            AND "senderId" != ${uid}
            AND NOT (${uid} = ANY("readByIds"))
          `;
        } else if (roomId) {
          const rid = parseInt(roomId, 10);
          await prisma.$executeRaw`
            UPDATE "Message" 
            SET "readByIds" = array_append("readByIds", ${uid}) 
            WHERE "roomId" = ${rid}
            AND "senderId" != ${uid}
            AND NOT (${uid} = ANY("readByIds"))
          `;
        } else if (conversationWithId) {
          const otherId = parseInt(conversationWithId, 10);
          await prisma.message.updateMany({
            where: {
              senderId: otherId,
              receiverId: uid,
              isRead: false
            },
            data: { isRead: true }
          });

          io.to(`user_${otherId}`).emit('messages_read', {
            byUserId: uid
          });
        }
      } catch (error) {
        console.error('Error marking read:', error);
      }
    });

    socket.on('delete_message', async ({ messageId } = {}) => {
      try {
        const msgId = parseInt(messageId, 10);
        if (isNaN(msgId)) return;

        const existing = await prisma.message.findUnique({ where: { id: msgId } });
        if (!existing) return;

        const isAdmin = (authenticatedUser.role || '').toLowerCase() === 'admin';
        if (existing.senderId !== authenticatedUser.id && !isAdmin) {
          return socket.emit('error', { message: 'Forbidden: Tidak dapat menghapus pesan pengguna lain.' });
        }

        const deletedMessage = await prisma.message.update({
          where: { id: msgId },
          data: { isDeleted: true, content: 'Pesan ini telah dihapus', attachmentUrl: null },
          include: { room: { include: { members: true } } }
        });

        if (deletedMessage.isPublic) {
          io.to('public_room').emit('message_deleted', { messageId: msgId });
        } else if (deletedMessage.roomId) {
          deletedMessage.room.members.forEach((member) => {
            io.to(`user_${member.userId}`).emit('message_deleted', { messageId: msgId });
          });
        } else {
          io.to(`user_${deletedMessage.senderId}`).emit('message_deleted', { messageId: msgId });
          if (deletedMessage.receiverId) {
            io.to(`user_${deletedMessage.receiverId}`).emit('message_deleted', { messageId: msgId });
          }
        }
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    });

    socket.on('edit_message', async ({ messageId, newContent } = {}) => {
      try {
        const msgId = parseInt(messageId, 10);
        if (isNaN(msgId) || typeof newContent !== 'string' || !newContent.trim()) return;

        const existing = await prisma.message.findUnique({ where: { id: msgId } });
        if (!existing || existing.senderId !== authenticatedUser.id) {
          return socket.emit('error', { message: 'Forbidden: Tidak dapat mengubah pesan pengguna lain.' });
        }

        const updatedMessage = await prisma.message.update({
          where: { id: msgId },
          data: {
            content: newContent,
            isEdited: true
          },
          include: { room: { include: { members: true } } }
        });

        const payload = {
          messageId: msgId,
          newContent,
          isEdited: true
        };

        if (updatedMessage.isPublic) {
          io.to('public_room').emit('message_edited', payload);
        } else if (updatedMessage.roomId) {
          updatedMessage.room.members.forEach((member) => {
            io.to(`user_${member.userId}`).emit('message_edited', payload);
          });
        } else {
          io.to(`user_${updatedMessage.senderId}`).emit('message_edited', payload);
          if (updatedMessage.receiverId) {
            io.to(`user_${updatedMessage.receiverId}`).emit('message_edited', payload);
          }
        }
      } catch (error) {
        console.error('Error editing message:', error);
      }
    });

    socket.on('delete_message_for_me', async ({ messageId } = {}) => {
      try {
        const msgId = parseInt(messageId, 10);
        if (isNaN(msgId)) return;

        await prisma.message.update({
          where: { id: msgId },
          data: {
            deletedBy: {
              connect: { id: authenticatedUser.id }
            }
          }
        });
        socket.emit('message_deleted_for_me', { messageId: msgId });
      } catch (error) {
        console.error('Error deleting message for me:', error);
      }
    });
  });
};
