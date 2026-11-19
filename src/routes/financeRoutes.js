const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.use(authenticateToken, authorizeRoles('admin', 'manager'));

router.get('/overview', financeController.getOverview);
router.get('/transactions', financeController.listTransactions);
router.post('/transactions', upload.single('buktiNota'), financeController.createTransaction);
router.put('/transactions/:id', upload.single('buktiNota'), financeController.updateTransaction);
router.delete('/transactions/:id', financeController.deleteTransaction);
router.get('/export-pdf', financeController.exportPdf);

module.exports = router;
