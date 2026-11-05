const orderRepository = require('../../repositories/orderRepository');

const normalizeOrderPaymentFields = (order) => {
    if (!order) return order;
    const total = Number(order.totalAmount) || 0;
    if (order.status === 'SELESAI') {
        return {
            ...order,
            paidAmount: total,
            remainingAmount: 0
        };
    }

    if (order.paymentUrl === 'MENUNGGU_PEMBAYARAN_ADMIN') {
        return {
            ...order,
            paymentType: 'DP',
            paidAmount: 0,
            remainingAmount: total
        };
    }

    const paid = Math.min(total, Math.max(0, Number(order.paidAmount) || 0));
    const remaining = Math.max(0, total - paid);

    return {
        ...order,
        paymentType: remaining > 0 ? 'DP' : (order.paymentType || 'FULL'),
        paidAmount: paid,
        remainingAmount: remaining
    };
};

const INTERNAL_STAFF_ROLES = ['admin', 'manager', 'desain', 'gudang'];

const isInternalStaff = (user) => {
    const role = user?.role?.toLowerCase() || '';
    return INTERNAL_STAFF_ROLES.includes(role);
};

const assertOrderOwnerOrStaff = async (orderId, user) => {
    const orderIdInt = parseInt(orderId, 10);
    const order = await orderRepository.findOrderById(orderIdInt);
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    if (!isInternalStaff(user) && order.customerId !== user?.id) {
        const error = new Error('Forbidden: Anda tidak memiliki akses ke pesanan ini');
        error.statusCode = 403;
        throw error;
    }

    return order;
};

const maskPhoneNumber = (phone) => {
    if (!phone || typeof phone !== 'string') return null;
    const trimmed = phone.trim();
    if (trimmed.length <= 6) return '***';
    return `${trimmed.slice(0, 4)}****${trimmed.slice(-2)}`;
};

module.exports = {
    normalizeOrderPaymentFields,
    INTERNAL_STAFF_ROLES,
    isInternalStaff,
    assertOrderOwnerOrStaff,
    maskPhoneNumber
};
