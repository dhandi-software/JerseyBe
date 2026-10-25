const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const upload = require('../middleware/upload');

const { authenticateToken } = require('../middleware/authMiddleware');

// Public tracking for receipt/order lookup
router.get('/track/:orderId', orderController.trackOrder);

// Authenticated order management
router.use(authenticateToken);

// Order CRUD & queries
router.post('/', orderController.createOrder);
router.get('/', orderController.getAllOrders);
router.patch('/:id/status', orderController.updateOrderStatus);
router.get('/customer/:customerId', orderController.getOrdersByCustomer);
router.get('/designer/:designerId', orderController.getOrdersByDesigner);
router.put('/:id', orderController.updateOrder);
router.patch('/:id/notes-video', orderController.updateVideoNotes);
router.post('/:id/detail', orderController.addOrderDetail);
router.patch('/detail/:detailId/status', orderController.updateDetailStatus);
router.patch('/detail/:detailId', orderController.updateOrderDetail);
router.delete('/detail/:detailId', orderController.deleteOrderDetail);

// Design & Mockup workflow
router.post('/:id/mockup', upload.single('mockup'), orderController.uploadMockup);
router.patch('/:id/payment', orderController.updatePayment);
router.patch('/:id/approve-design', orderController.approveDesign);
router.patch('/:id/unapprove-design', orderController.unapproveDesign);
router.patch('/:id/revisi-design', orderController.revisiDesign);
router.patch('/:id/cancel-mockup', orderController.cancelMockup);

// Layout workflow
router.post('/:id/layout', upload.single('layout'), orderController.uploadLayout);
router.patch('/:id/approve-layout', orderController.approveLayout);
router.patch('/:id/unapprove-layout', orderController.unapproveLayout);
router.patch('/:id/revisi-layout', orderController.revisiLayout);
router.patch('/:id/cancel-layout', orderController.cancelLayout);

// Production proof uploads
router.post('/:id/print', upload.single('print'), orderController.uploadPrint);
router.post('/:id/finishing', upload.single('finishing'), orderController.uploadFinishing);

// Material alternatives
router.patch('/:id/recommend-alternatives', orderController.recommendAlternatives);
router.patch('/:id/select-alternative', orderController.selectAlternative);

// Tailoring damage tracking
router.post('/:id/damage', orderController.recordDamage);
router.put('/damage/:historyId', orderController.updateDamage);
router.get('/:id/damage-history', orderController.getDamageHistory);

module.exports = router;
