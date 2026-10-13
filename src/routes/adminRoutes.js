const express = require('express');
const router = express.Router();
const {
    createCustomer,
    createTeamInternal,
    getUserCountByRole,
    getUsersByRole,
    getAllUsers,
    updateUser,
    deleteUser,
    deleteUsersBatch,
    getUserById,
    getDashboardStats,
    getAllChatCustomers,
    getDesigners,
    getOmsetReport
} = require('../controllers/adminController');

const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.post('/create-customer', authorizeRoles('admin', 'manager'), createCustomer);
router.post('/create-staff', authorizeRoles('admin', 'manager'), createTeamInternal);

router.get('/users/count', authorizeRoles('admin', 'manager'), getUserCountByRole);
router.get('/users-role', authorizeRoles('admin', 'manager'), getUsersByRole);
router.get('/users', authorizeRoles('admin', 'manager'), getAllUsers);
router.post('/users/batch-delete', authorizeRoles('admin', 'manager'), deleteUsersBatch);
router.get('/designers', authorizeRoles('admin', 'manager', 'desain', 'gudang'), getDesigners);
router.get('/dashboard-stats', authorizeRoles('admin', 'manager'), getDashboardStats);
router.get('/omset-report', authorizeRoles('admin', 'manager'), getOmsetReport);
router.get('/chat-customers', authorizeRoles('admin', 'manager', 'desain', 'gudang'), getAllChatCustomers);

router.get('/users/:id', authorizeRoles('admin', 'manager'), getUserById);
router.put('/users/:id', authorizeRoles('admin', 'manager'), updateUser);
router.delete('/users/:id', authorizeRoles('admin', 'manager'), deleteUser);

module.exports = router;
