const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { optionalAuthenticateToken } = require('../middleware/authMiddleware');

// Dedicated decoupled file upload endpoint
router.post('/', optionalAuthenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({
        success: true,
        url,
        originalName: req.file.originalname,
        size: req.file.size,
        name: req.file.originalname,
        type: req.file.mimetype
    });
});

module.exports = router;
