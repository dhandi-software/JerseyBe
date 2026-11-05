const customerTrackingService = require('../services/customerTrackingService');

const suggestCustomers = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string' || q.trim().length === 0) {
            return res.json({ success: true, customers: [] });
        }
        const customers = await customerTrackingService.searchCustomerSuggestions(q);
        res.json({ success: true, customers });
    } catch (error) {
        console.error('Failed to search customer suggestions:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Gagal mencari saran pelanggan'
        });
    }
};

const getCustomerHistory = async (req, res) => {
    try {
        const { phone, name, customerId } = req.query;
        const result = await customerTrackingService.getCustomerOrderHistory({
            phone,
            name,
            customerId
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Failed to fetch customer order history:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Gagal mengambil riwayat pesanan pelanggan'
        });
    }
};

module.exports = {
    suggestCustomers,
    getCustomerHistory
};
