const orderService = require('../services/orderService');

const handleControllerError = (res, logMessage, error, fallbackMessage) => {
    console.error(logMessage, error);
    if (error && error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: fallbackMessage });
};

const createOrder = async (req, res) => {
    try {
        const orderData = {
            ...req.body,
            callerRole: req.user?.role
        };
        if (req.user?.role?.toLowerCase() === 'customer' || !orderData.customerId) {
            orderData.customerId = req.user.id;
        }

        const order = await orderService.createOrder(orderData);
        res.status(201).json(order);
    } catch (error) {
        handleControllerError(res, 'Failed to create order:', error, 'Failed to create order');
    }
};

const getAllOrders = async (req, res) => {
    try {
        const { search, q, status, storageLocationId } = req.query;
        const formattedOrders = await orderService.getAllOrders({
            search: search || q,
            status,
            storageLocationId
        });
        res.json(formattedOrders);
    } catch (error) {
        handleControllerError(res, 'Failed to fetch orders:', error, 'Failed to fetch orders');
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await orderService.updateOrderStatus(id, req.body);
        res.json(result);
    } catch (error) {
        handleControllerError(res, 'Failed to update order status:', error, 'Failed to update order status');
    }
};

const getOrdersByCustomer = async (req, res) => {
    try {
        const { customerId } = req.params;
        const targetId = parseInt(customerId, 10);
        const isCustomer = req.user?.role?.toLowerCase() === 'customer';

        if (isCustomer && req.user.id !== targetId) {
            return res.status(403).json({ error: 'Forbidden: Tidak dapat melihat pesanan pengguna lain' });
        }

        const formatted = await orderService.getOrdersByCustomer(targetId);
        res.json(formatted);
    } catch (error) {
        handleControllerError(res, 'Failed to fetch customer orders:', error, 'Failed to fetch customer orders');
    }
};

const getOrdersByDesigner = async (req, res) => {
    try {
        const { designerId } = req.params;
        const formatted = await orderService.getOrdersByDesigner(designerId);
        res.json(formatted);
    } catch (error) {
        handleControllerError(res, 'Failed to fetch designer orders:', error, 'Failed to fetch designer orders');
    }
};

const trackOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const formattedOrder = await orderService.trackOrder(orderId, req.user);
        res.json(formattedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to track order:', error, 'Failed to track order');
    }
};

const updateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.updateOrder(id, req.body, req.user);
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to edit order:', error, 'Failed to edit order');
    }
};

const uploadMockup = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadMockup(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to upload mockup:', error, 'Failed to upload mockup');
    }
};

const updatePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentUrl, paymentType, paidAmount, remainingAmount } = req.body;
        const updated = await orderService.updatePayment(
            id,
            { paymentUrl, paymentType, paidAmount, remainingAmount },
            req.user
        );
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to update payment details:', error, 'Failed to update payment details');
    }
};

const addPaymentInstallment = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await orderService.addPaymentInstallment(id, req.body, req.user);
        res.status(201).json(result);
    } catch (error) {
        handleControllerError(res, 'Failed to add payment installment:', error, 'Failed to add payment installment');
    }
};

const getPaymentInstallments = async (req, res) => {
    try {
        const { id } = req.params;
        const installments = await orderService.getPaymentInstallments(id, req.user);
        res.json(installments);
    } catch (error) {
        handleControllerError(res, 'Failed to fetch payment installments:', error, 'Failed to fetch payment installments');
    }
};

const approveDesign = async (req, res) => {
    try {
        const { id } = req.params;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updated = await orderService.approveDesign(id);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to approve design:', error, 'Failed to approve design');
    }
};

const unapproveDesign = async (req, res) => {
    try {
        const { id } = req.params;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updated = await orderService.unapproveDesign(id);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to unapprove design:', error, 'Failed to unapprove design');
    }
};

const revisiDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updated = await orderService.revisiDesign(id, feedback);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to submit design revision:', error, 'Failed to submit design revision');
    }
};

const cancelMockup = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.cancelMockup(id);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to cancel mockup:', error, 'Failed to cancel mockup');
    }
};

const uploadLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadLayout(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to upload layout:', error, 'Failed to upload layout');
    }
};

const approveLayout = async (req, res) => {
    try {
        const { id } = req.params;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updated = await orderService.approveLayout(id);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to approve layout:', error, 'Failed to approve layout');
    }
};

const unapproveLayout = async (req, res) => {
    try {
        const { id } = req.params;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updated = await orderService.unapproveLayout(id);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to unapprove layout:', error, 'Failed to unapprove layout');
    }
};

const revisiLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updated = await orderService.revisiLayout(id, feedback);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to submit layout revision:', error, 'Failed to submit layout revision');
    }
};

const cancelLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await orderService.cancelLayout(id);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to cancel layout:', error, 'Failed to cancel layout');
    }
};

const uploadPrint = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadPrint(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to upload print photo:', error, 'Failed to upload print photo');
    }
};

const uploadFinishing = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedOrder = await orderService.uploadFinishing(id, req.file);
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to upload finishing photo:', error, 'Failed to upload finishing photo');
    }
};

const recommendAlternatives = async (req, res) => {
    try {
        const { id } = req.params;
        const { recommendedBahanIds } = req.body;
        const updated = await orderService.recommendAlternatives(id, recommendedBahanIds);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to recommend alternatives:', error, 'Failed to recommend alternatives');
    }
};

const selectAlternative = async (req, res) => {
    try {
        const { id } = req.params;
        const { selectedBahanId } = req.body;
        await orderService.assertOrderOwnerOrStaff(id, req.user);
        const updatedOrder = await orderService.selectAlternative(id, selectedBahanId);
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to select alternative material:', error, 'Failed to select alternative material');
    }
};

const recordDamage = async (req, res) => {
    try {
        const { id } = req.params;
        const { productId, pcs, keterangan, actor } = req.body;
        const updatedOrder = await orderService.recordDamage(id, { productId, pcs, keterangan, actor });
        res.json(updatedOrder);
    } catch (error) {
        handleControllerError(res, 'Failed to report damage:', error, 'Failed to report damage');
    }
};

const updateDamage = async (req, res) => {
    try {
        const { historyId } = req.params;
        const { pcs, keterangan, actor } = req.body;
        const updatedHistory = await orderService.updateDamage(historyId, { pcs, keterangan, actor });
        res.json(updatedHistory);
    } catch (error) {
        handleControllerError(res, 'Failed to update damage report:', error, 'Failed to update damage report');
    }
};

const getDamageHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const histories = await orderService.getDamageHistory(id);
        res.json(histories);
    } catch (error) {
        handleControllerError(res, 'Failed to fetch damage history:', error, 'Failed to fetch damage history');
    }
};

const updateDetailStatus = async (req, res) => {
    try {
        const { detailId } = req.params;
        const { statusBaju, statusCelana } = req.body;
        const updated = await orderService.updateDetailStatus(detailId, { statusBaju, statusCelana });
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to update member detail status:', error, 'Failed to update member detail status');
    }
};

const updateVideoNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { videoUrl, adminNote, designNote } = req.body;
        const updated = await orderService.updateVideoNotes(id, { videoUrl, adminNote, designNote });
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to update video and notes:', error, 'Failed to update video and notes');
    }
};

const updateOrderDetail = async (req, res) => {
    try {
        const { detailId } = req.params;
        const updated = await orderService.updateOrderDetail(detailId, req.body);
        res.json(updated);
    } catch (error) {
        handleControllerError(res, 'Failed to update order detail:', error, 'Failed to update order detail');
    }
};

const addOrderDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const newDetail = await orderService.addOrderDetail(id, req.body);
        res.status(201).json(newDetail);
    } catch (error) {
        handleControllerError(res, 'Failed to add order detail:', error, 'Failed to add order detail');
    }
};

const deleteOrderDetail = async (req, res) => {
    try {
        const { detailId } = req.params;
        const deleted = await orderService.deleteOrderDetail(detailId);
        res.json({ message: 'Detail anggota berhasil dihapus', deleted });
    } catch (error) {
        handleControllerError(res, 'Failed to delete order detail:', error, 'Failed to delete order detail');
    }
};

const updateOrderStorageLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { storageLocationId } = req.body;
        const updatedOrder = await orderService.assignOrderStorageLocation(id, storageLocationId);
        res.json({
            status: 'success',
            data: updatedOrder,
            message: storageLocationId !== null && storageLocationId !== undefined && storageLocationId !== ''
                ? 'Lokasi penyimpanan pesanan berhasil ditetapkan'
                : 'Lokasi penyimpanan pesanan berhasil dihapus'
        });
    } catch (error) {
        handleControllerError(res, 'Failed to update order storage location:', error, 'Gagal memperbarui lokasi penyimpanan pesanan');
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
    addPaymentInstallment,
    getPaymentInstallments,
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
    getDamageHistory,
    updateDetailStatus,
    updateOrderDetail,
    addOrderDetail,
    deleteOrderDetail,
    updateVideoNotes,
    updateOrderStorageLocation
};
