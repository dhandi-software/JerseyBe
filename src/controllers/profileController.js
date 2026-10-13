const userService = require('../services/userService');

const getProfile = async (req, res) => {
    try {
        const targetId = req.params.id || req.user?.id;
        if (!targetId) {
            return res.status(400).json({ message: 'User ID is required' });
        }
        const profile = await userService.getProfile(targetId);

        res.status(200).json({
            code: 200,
            status: 'success',
            message: 'Profile retrieved successfully',
            data: profile
        });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({ message: error.message });
        }
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const targetUserId = parseInt(id, 10);
        const currentUserId = parseInt(req.user?.id, 10);
        const role = req.user?.role?.toLowerCase();

        if (currentUserId !== targetUserId && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Tidak dapat mengubah profil pengguna lain' });
        }

        const { name, bio } = req.body;

        let photoUrl;
        if (req.file) {
            photoUrl = req.file.filename;
        } else if (req.body.photo === '') {
            photoUrl = null;
        }

        const result = await userService.updateProfile(id, { name, bio, photoUrl });

        res.status(200).json({
            code: 200,
            status: 'success',
            message: result.message
        });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({ message: error.message });
        }
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getProfile,
    updateProfile
};
