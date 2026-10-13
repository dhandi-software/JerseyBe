const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/profiles');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const { authenticateToken } = require('../middleware/authMiddleware');
const { webpConversionMiddleware } = require('../utils/imageConverter');

const ALLOWED_AVATAR_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, Date.now() + safeExt);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_AVATAR_EXT.has(ext) || !ALLOWED_AVATAR_MIMES.has(file.mimetype.toLowerCase())) {
            const err = new Error('Format avatar tidak didukung. Gunakan JPG, PNG, atau WebP.');
            err.statusCode = 400;
            return cb(err, false);
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/', authenticateToken, profileController.getProfile);
router.get('/profile', authenticateToken, profileController.getProfile);
router.get('/:id', authenticateToken, profileController.getProfile);
router.put('/:id', authenticateToken, upload.single('photo'), webpConversionMiddleware, profileController.updateProfile);

module.exports = router;
