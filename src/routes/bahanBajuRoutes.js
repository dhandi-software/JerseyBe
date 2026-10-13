const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
    getAllBahan,
    getHistory,
    createBahan,
    updateBahan,
    deleteBahan,
    getReturBahan
} = require('../controllers/bahanBajuController');

const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Public catalog listing for customer and visitor browsing
router.get('/', getAllBahan);

// Internal staff routes
router.use(authenticateToken);
router.get('/history', authorizeRoles('admin', 'gudang', 'manager'), getHistory);
router.get('/retur', authorizeRoles('admin', 'gudang', 'manager'), getReturBahan);

router.post('/', authorizeRoles('admin', 'gudang'), upload.fields([{ name: 'image', maxCount: 1 }, { name: 'buktiNota', maxCount: 1 }]), createBahan);
router.put('/:id', authorizeRoles('admin', 'gudang'), upload.fields([{ name: 'image', maxCount: 1 }, { name: 'buktiNota', maxCount: 1 }]), updateBahan);
router.delete('/:id', authorizeRoles('admin', 'gudang'), deleteBahan);

module.exports = router;
