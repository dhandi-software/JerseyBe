const express = require('express');
const router = express.Router();
const storageLocationController = require('../controllers/storageLocationController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

const STAFF_ROLES = ['admin', 'manager', 'desain', 'gudang'];
const WRITE_ROLES = ['admin', 'gudang'];
const DELETE_ROLES = ['admin'];

// All storage location routes require authenticated session
router.use(authenticateToken);

// Read routes: Accessible by staff
router.get('/', authorizeRoles(...STAFF_ROLES), storageLocationController.getAllLocations);
router.get('/:id', authorizeRoles(...STAFF_ROLES), storageLocationController.getLocationById);

// Write/Update routes: Restricted to Admin and Gudang
router.post('/', authorizeRoles(...WRITE_ROLES), storageLocationController.createLocation);
router.put('/:id', authorizeRoles(...WRITE_ROLES), storageLocationController.updateLocation);

// Delete route: Restricted to Admin only
router.delete('/:id', authorizeRoles(...DELETE_ROLES), storageLocationController.deleteLocation);

module.exports = router;
