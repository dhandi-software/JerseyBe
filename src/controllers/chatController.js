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
        const formattedMessages = await chatService.getChatHistory(userId, otherUserId);
        res.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getContacts = async (req, res) => {
    try {
        const result = await chatService.getContacts(req.params.userId);
        res.json(result);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getUnreadCount = async (req, res) => {
    try {
        const result = await chatService.getUnreadCount(req.params.userId);
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
