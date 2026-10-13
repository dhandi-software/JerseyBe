const chatService = require('../services/chatService');

const uploadAttachment = (req, res) => {
    try {
        const result = chatService.uploadAttachment(req.file);
        res.json(result);
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getChatHistory = async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;
        const uId = parseInt(userId, 10);
        const oId = parseInt(otherUserId, 10);

        if (req.user.id !== uId && req.user.id !== oId && req.user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Anda bukan partisipan dalam percakapan ini' });
        }

        const formattedMessages = await chatService.getChatHistory(uId, oId);
        res.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getContacts = async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId, 10);
        if (req.user.id !== targetUserId && req.user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Tidak dapat mengakses kontak pengguna lain' });
        }

        const result = await chatService.getContacts(targetUserId);
        res.json(result);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getUnreadCount = async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId, 10);
        if (req.user.id !== targetUserId && req.user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Tidak dapat mengakses notifikasi pengguna lain' });
        }

        const result = await chatService.getUnreadCount(targetUserId);
        res.json(result);
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    uploadAttachment,
    getChatHistory,
    getContacts,
    getUnreadCount
};
