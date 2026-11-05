const orderRepository = require('../../repositories/orderRepository');

/**
 * Upload designer mockup file and set status to SENT.
 */
const uploadMockup = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const mockupUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, {
        mockupUrl,
        designStatus: 'SENT'
    });
};

/**
 * Approve mockup design.
 */
const approveDesign = async (id) => {
    return await orderRepository.updateOrder(id, {
        designStatus: 'APPROVED',
        designFeedback: null
    });
};

/**
 * Revert design approval back to SENT (allowed only in DESAIN or LAYOUT status).
 */
const unapproveDesign = async (id) => {
    const order = await orderRepository.findOrderById(id);
    if (!order || (order.status !== 'DESAIN' && order.status !== 'LAYOUT')) {
        const error = new Error('Cannot unapprove design at this stage');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        designStatus: 'SENT'
    });
};

/**
 * Request design revision with required feedback message.
 */
const revisiDesign = async (id, feedback) => {
    if (!feedback) {
        const error = new Error('Feedback is required for revision');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        designStatus: 'REVISI',
        designFeedback: feedback
    });
};

/**
 * Cancel uploaded mockup and reset status to PENDING.
 */
const cancelMockup = async (id) => {
    return await orderRepository.updateOrder(id, {
        mockupUrl: null,
        designStatus: 'PENDING'
    });
};

module.exports = {
    uploadMockup,
    approveDesign,
    unapproveDesign,
    revisiDesign,
    cancelMockup
};
