const express = require('express');
const router = express.Router();
const { 
    createCustomer, 
    createTeamInternal,
    getUserCountByRole,
    getUsersByRole,
    updateUser,
    deleteUser,
    getUserById,
    getDashboardStats,
    getAllChatCustomers,
    getDesigners
} = require('../controllers/adminController');

// Routes updated to use commercial terminology
router.post('/create-customer', createCustomer);
router.post('/create-staff', createTeamInternal);

router.get('/users/count', getUserCountByRole);
router.get('/users-role', getUsersByRole);
router.get('/designers', getDesigners);
router.get('/dashboard-stats', getDashboardStats);
router.get('/chat-customers', getAllChatCustomers);

router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

module.exports = router;
