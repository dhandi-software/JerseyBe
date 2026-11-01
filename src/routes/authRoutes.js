const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { authenticateToken } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimit');

const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyPrefix: 'auth_login',
    message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.'
});

const registerLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: 'auth_register',
    message: 'Terlalu banyak percobaan pendaftaran. Silakan coba lagi nanti.'
});

router.post('/login', loginLimiter, authController.login);
router.post('/register', registerLimiter, authController.register);
router.post('/logout', authController.logout);
router.put('/change-password', authenticateToken, authController.changePassword);

module.exports = router;
