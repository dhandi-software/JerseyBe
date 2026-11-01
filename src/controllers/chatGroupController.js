const chatService = require('../services/chatService');

const createGroup = async (req, res) => {
    try {
        const { name, memberIds } = req.body;
        const adminId = req.user.id;
        const formattedRoom = await chatService.createGroup({ name, memberIds, adminId });
        res.status(201).json(formattedRoom);
    } catch (error) {
        console.error('Error creating chat group:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

const addMembers = async (req, res) => {
    try {
        const roomId = req.params.id;
        const { memberIds } = req.body;
        const adminId = req.user.id;
        const formattedRoom = await chatService.addMembers(roomId, memberIds, adminId);
        res.status(200).json(formattedRoom);
    } catch (error) {
        console.error('Error adding chat group members:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

const removeMember = async (req, res) => {
    try {
        const roomId = req.params.id;
        const userId = req.params.userId;
        const adminId = req.user.id;
        const io = req.app.get('io');

        const formattedRoom = await chatService.removeMember(roomId, userId, adminId, io);
        res.status(200).json(formattedRoom);
    } catch (error) {
        console.error('Error removing chat group member:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

const deleteGroup = async (req, res) => {
    try {
        const roomId = req.params.id;
        const adminId = req.user.id;
        const io = req.app.get('io');

        const result = await chatService.deleteGroup(roomId, adminId, io);
        res.status(200).json({ message: result.message, roomId: result.roomId });
    } catch (error) {
        console.error('Error deleting chat group:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    createGroup,
    addMembers,
    removeMember,
    deleteGroup
};
