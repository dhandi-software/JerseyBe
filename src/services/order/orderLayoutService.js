const orderRepository = require('../../repositories/orderRepository');

/**
 * Upload layout proof file and set layout status to SENT.
 */
const uploadLayout = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const layoutUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, {
        layoutUrl,
        layoutStatus: 'SENT'
    });
};

/**
 * Approve layout proof.
 */
const approveLayout = async (id) => {
    return await orderRepository.updateOrder(id, {
        layoutStatus: 'APPROVED',
        layoutFeedback: null
    });
};

/**
 * Revert layout approval back to SENT (allowed only in LAYOUT status).
 */
const unapproveLayout = async (id) => {
    const order = await orderRepository.findOrderById(id);
    if (!order || order.status !== 'LAYOUT') {
        const error = new Error('Cannot unapprove layout at this stage');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        layoutStatus: 'SENT'
    });
};

/**
 * Request layout revision with required feedback message.
 */
const revisiLayout = async (id, feedback) => {
    if (!feedback) {
        const error = new Error('Feedback is required for revision');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        layoutStatus: 'REVISI',
        layoutFeedback: feedback
    });
};

/**
 * Cancel uploaded layout proof and reset status to PENDING.
 */
const cancelLayout = async (id) => {
    return await orderRepository.updateOrder(id, {
        layoutUrl: null,
        layoutStatus: 'PENDING'
    });
};

/**
 * Upload production print proof photo.
 */
const uploadPrint = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const printUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, { printUrl });
};

/**
 * Upload finishing proof photo.
 */
const uploadFinishing = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const finishingUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, { finishingUrl });
};

module.exports = {
    uploadLayout,
    approveLayout,
    unapproveLayout,
    revisiLayout,
    cancelLayout,
    uploadPrint,
    uploadFinishing
};
