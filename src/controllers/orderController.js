const orderService = require('../services/orderService');

const createOrder = async (req, res) => {
    try {
        const order = await orderService.createOrder(req.body);
        res.status(201).json(order);
    } catch (error) {
        console.error('Failed to create order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
};

const getAllOrders = async (req, res) => {
    try {
        const formattedOrders = await orderService.getAllOrders();
        res.json(formattedOrders);
    } catch (error) {
        console.error('Failed to fetch orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await orderService.updateOrderStatus(id, req.body);
        res.json(result);
    } catch (error) {
        console.error('Failed to update order status:', error);
        if (error.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update order status' });
    }
};

const getOrdersByCustomer = async (req, res) => {
    try {
        const { customerId } = req.params;
        const formatted = await orderService.getOrdersByCustomer(customerId);
        res.json(formatted);
    } catch (error) {
        console.error('Failed to fetch customer orders:', error);
        res.status(500).json({ error: 'Failed to fetch customer orders' });
    }
};

const getOrdersByDesigner = async (req, res) => {
    try {
        const { designerId } = req.params;
        const formatted = await orderService.getOrdersByDesigner(designerId);
        res.json(formatted);
    } catch (error) {
        console.error('Failed to fetch designer orders:', error);
        res.status(500).json({ error: 'Failed to fetch designer orders' });
    }
};

const trackOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const formattedOrder = await orderService.trackOrder(orderId);
        res.json(formattedOrder);
    } catch (error) {
        console.error('Failed to track order:', error);
        if (error.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to track order' });
    }
};

const updateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.updateOrder(id, req.body);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to edit order:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to edit order' });
    }
};

const uploadMockup = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadMockup(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to upload mockup:', error);
        if (error.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to upload mockup' });
    }
};

const updatePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentUrl } = req.body;
        const updated = await orderService.updatePayment(id, paymentUrl);
        res.json(updated);
    } catch (error) {
        console.error('Failed to update payment URL:', error);
        res.status(500).json({ error: 'Failed to update payment URL' });
    }
};

const approveDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.approveDesign(id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to approve design:', error);
        res.status(500).json({ error: 'Failed to approve design' });
    }
};

const unapproveDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.unapproveDesign(id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to unapprove design:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to unapprove design' });
    }
};

const revisiDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        const updated = await orderService.revisiDesign(id, feedback);
        res.json(updated);
    } catch (error) {
        console.error('Failed to submit design revision:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to submit design revision' });
    }
};

const cancelMockup = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.cancelMockup(id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to cancel mockup:', error);
        res.status(500).json({ error: 'Failed to cancel mockup' });
    }
};

const uploadLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadLayout(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to upload layout:', error);
        if (error.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to upload layout' });
    }
};

const approveLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.approveLayout(id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to approve layout:', error);
        res.status(500).json({ error: 'Failed to approve layout' });
    }
};

const unapproveLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.unapproveLayout(id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to unapprove layout:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to unapprove layout' });
    }
};

const revisiLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        const updated = await orderService.revisiLayout(id, feedback);
        res.json(updated);
    } catch (error) {
        console.error('Failed to submit layout revision:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to submit layout revision' });
    }
};

const cancelLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.cancelLayout(id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to cancel layout:', error);
        res.status(500).json({ error: 'Failed to cancel layout' });
    }
};

const uploadPrint = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadPrint(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to upload print photo:', error);
        if (error.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to upload print photo' });
    }
};

const uploadFinishing = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadFinishing(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to upload finishing photo:', error);
        if (error.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to upload finishing photo' });
    }
};

const recommendAlternatives = async (req, res) => {
    try {
        const { id } = req.params;
        const { recommendedBahanIds } = req.body;
        const updated = await orderService.recommendAlternatives(id, recommendedBahanIds);
        res.json(updated);
    } catch (error) {
        console.error('Failed to recommend alternatives:', error);
        res.status(500).json({ error: 'Failed to recommend alternatives' });
    }
};

const selectAlternative = async (req, res) => {
    try {
        const { id } = req.params;
        const { selectedBahanId } = req.body;
        const updatedOrder = await orderService.selectAlternative(id, selectedBahanId);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to select alternative material:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to select alternative material' });
    }
};

const recordDamage = async (req, res) => {
    try {
        const { id } = req.params;
        const { productId, pcs, keterangan, actor } = req.body;
        const updatedOrder = await orderService.recordDamage(id, { productId, pcs, keterangan, actor });
        res.json(updatedOrder);
    } catch (error) {
        console.error('Failed to report damage:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to report damage' });
    }
};

const updateDamage = async (req, res) => {
    try {
        const { historyId } = req.params;
        const { pcs, keterangan, actor } = req.body;
        const updatedHistory = await orderService.updateDamage(historyId, { pcs, keterangan, actor });
        res.json(updatedHistory);
    } catch (error) {
        console.error('Failed to update damage report:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update damage report' });
    }
};

const getDamageHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const histories = await orderService.getDamageHistory(id);
        res.json(histories);
    } catch (error) {
        console.error('Failed to fetch damage history:', error);
        res.status(500).json({ error: 'Failed to fetch damage history' });
    }
};

module.exports = {
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getOrdersByCustomer,
    getOrdersByDesigner,
    trackOrder,
    updateOrder,
    uploadMockup,
    updatePayment,
    approveDesign,
    unapproveDesign,
    revisiDesign,
    cancelMockup,
    uploadLayout,
    approveLayout,
    unapproveLayout,
    revisiLayout,
    cancelLayout,
    uploadPrint,
    uploadFinishing,
    recommendAlternatives,
    selectAlternative,
    recordDamage,
    updateDamage,
    getDamageHistory
};
