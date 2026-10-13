const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// User profile & self-service
router.get('/profile', profileController.getProfile);
router.put('/change-password', authController.changePassword);

// Administrative user management compatibility
router.get('/', authorizeRoles('admin', 'manager'), adminController.getAllUsers);
router.get('/:id', authorizeRoles('admin', 'manager'), adminController.getUserById);
router.put('/:id', authorizeRoles('admin', 'manager'), adminController.updateUser);
router.delete('/:id', authorizeRoles('admin', 'manager'), adminController.deleteUser);

module.exports = router;
