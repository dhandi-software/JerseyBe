const userService = require('../services/userService');

const getProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await userService.getProfile(id);

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
