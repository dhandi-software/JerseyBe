const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const customerTrackingController = require('../controllers/customerTrackingController');
const upload = require('../middleware/upload');

const {
    authenticateToken,
    optionalAuthenticateToken,
    authorizeRoles
} = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimit');

const STAFF_ROLES = ['admin', 'manager', 'desain', 'gudang'];

const trackLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 60,
    keyPrefix: 'order_track',
    message: 'Terlalu banyak permintaan pelacakan pesanan. Silakan coba lagi sebentar.'
});

// Public tracking for receipt/order lookup (masks PII unless owner or staff)
router.get('/track/:orderId', trackLimiter, optionalAuthenticateToken, orderController.trackOrder);

// Authenticated order management
router.use(authenticateToken);

// Customer Repeat Tracking Core (R4) - Mounted before /:id parameterized routes
router.get('/customers/suggest', authorizeRoles(...STAFF_ROLES), customerTrackingController.suggestCustomers);
router.get('/customers/history', authorizeRoles(...STAFF_ROLES), customerTrackingController.getCustomerHistory);

// Order CRUD & queries
router.post('/', orderController.createOrder);
router.get('/', authorizeRoles(...STAFF_ROLES), orderController.getAllOrders);
router.patch('/:id/status', authorizeRoles(...STAFF_ROLES), orderController.updateOrderStatus);
router.patch('/:id/storage-location', authorizeRoles('admin', 'gudang'), orderController.updateOrderStorageLocation);
router.get('/customer/:customerId', orderController.getOrdersByCustomer);
router.get('/designer/:designerId', authorizeRoles(...STAFF_ROLES), orderController.getOrdersByDesigner);
router.put('/:id', orderController.updateOrder);
router.patch('/:id/notes-video', authorizeRoles(...STAFF_ROLES), orderController.updateVideoNotes);
router.post('/:id/detail', authorizeRoles(...STAFF_ROLES), orderController.addOrderDetail);
router.patch('/detail/:detailId/status', authorizeRoles(...STAFF_ROLES), orderController.updateDetailStatus);
router.patch('/detail/:detailId', authorizeRoles(...STAFF_ROLES), orderController.updateOrderDetail);
router.delete('/detail/:detailId', authorizeRoles(...STAFF_ROLES), orderController.deleteOrderDetail);

// Design & Mockup workflow
router.post('/:id/mockup', authorizeRoles(...STAFF_ROLES), upload.single('mockup'), orderController.uploadMockup);
// Payment & Installment Ledger workflow
router.patch('/:id/payment', orderController.updatePayment);
router.post('/:id/payments', orderController.addPaymentInstallment);
router.get('/:id/payments', orderController.getPaymentInstallments);
router.patch('/:id/approve-design', orderController.approveDesign);
router.patch('/:id/unapprove-design', orderController.unapproveDesign);
router.patch('/:id/revisi-design', orderController.revisiDesign);
router.patch('/:id/cancel-mockup', authorizeRoles(...STAFF_ROLES), orderController.cancelMockup);

// Layout workflow
router.post('/:id/layout', authorizeRoles(...STAFF_ROLES), upload.single('layout'), orderController.uploadLayout);
router.patch('/:id/approve-layout', orderController.approveLayout);
router.patch('/:id/unapprove-layout', orderController.unapproveLayout);
router.patch('/:id/revisi-layout', orderController.revisiLayout);
router.patch('/:id/cancel-layout', authorizeRoles(...STAFF_ROLES), orderController.cancelLayout);

// Production proof uploads
router.post('/:id/print', authorizeRoles(...STAFF_ROLES), upload.single('print'), orderController.uploadPrint);
router.post('/:id/finishing', authorizeRoles(...STAFF_ROLES), upload.single('finishing'), orderController.uploadFinishing);

// Material alternatives
router.patch('/:id/recommend-alternatives', authorizeRoles(...STAFF_ROLES), orderController.recommendAlternatives);
router.patch('/:id/select-alternative', orderController.selectAlternative);

// Tailoring damage tracking
router.post('/:id/damage', authorizeRoles(...STAFF_ROLES), orderController.recordDamage);
router.put('/damage/:historyId', authorizeRoles(...STAFF_ROLES), orderController.updateDamage);
router.get('/:id/damage-history', authorizeRoles(...STAFF_ROLES), orderController.getDamageHistory);

module.exports = router;
