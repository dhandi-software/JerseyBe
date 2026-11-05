const prisma = require('../config/prisma');

/**
 * Create a new payment installment record.
 * @param {Object} data - { orderId, installmentNo, stage, amount, paymentMethod, proofUrl, notes }
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<Object>} Created OrderPayment
 */
const createPayment = async (data, tx = prisma) => {
    return await tx.orderPayment.create({
        data: {
            orderId: parseInt(data.orderId, 10),
            installmentNo: parseInt(data.installmentNo, 10),
            stage: data.stage || 'DP',
            amount: parseFloat(data.amount),
            paymentMethod: data.paymentMethod ? String(data.paymentMethod).trim() : 'TRANSFER',
            proofUrl: data.proofUrl ? String(data.proofUrl).trim() : null,
            notes: data.notes ? String(data.notes).trim() : null
        }
    });
};

/**
 * Retrieve all payment installments for an order, ordered by installment number.
 * @param {number|string} orderId - Order ID
 * @param {Object} orderBy - Order clause (default { installmentNo: 'asc' })
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<Array>} List of OrderPayment records
 */
const findPaymentsByOrderId = async (orderId, orderBy = { installmentNo: 'asc' }, tx = prisma) => {
    return await tx.orderPayment.findMany({
        where: { orderId: parseInt(orderId, 10) },
        orderBy
    });
};

/**
 * Calculate the total accumulated paid amount for an order across all installments.
 * @param {number|string} orderId - Order ID
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<number>} Total amount paid
 */
const calculateTotalPaid = async (orderId, tx = prisma) => {
    const agg = await tx.orderPayment.aggregate({
        where: { orderId: parseInt(orderId, 10) },
        _sum: { amount: true }
    });
    return agg._sum.amount || 0;
};

/**
 * Count the number of payment installments recorded for an order.
 * @param {number|string} orderId - Order ID
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<number>} Number of installments
 */
const countPaymentsByOrderId = async (orderId, tx = prisma) => {
    return await tx.orderPayment.count({
        where: { orderId: parseInt(orderId, 10) }
    });
};

/**
 * Find a specific payment record by its primary key ID.
 * @param {number|string} id - Payment primary key ID
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<Object|null>} OrderPayment record or null
 */
const findPaymentById = async (id, tx = prisma) => {
    return await tx.orderPayment.findUnique({
        where: { id: parseInt(id, 10) }
    });
};

/**
 * Update an existing payment record.
 * @param {number|string} id - Payment ID
 * @param {Object} data - Fields to update
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<Object>} Updated OrderPayment
 */
const updatePayment = async (id, data, tx = prisma) => {
    return await tx.orderPayment.update({
        where: { id: parseInt(id, 10) },
        data
    });
};

/**
 * Delete a payment record by ID.
 * @param {number|string} id - Payment ID
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<Object>} Deleted OrderPayment
 */
const deletePayment = async (id, tx = prisma) => {
    return await tx.orderPayment.delete({
        where: { id: parseInt(id, 10) }
    });
};

/**
 * Retrieve the latest payment record for an order.
 * @param {number|string} orderId - Order ID
 * @param {Object} tx - Optional Prisma transaction client
 * @returns {Promise<Object|null>} Latest OrderPayment or null
 */
const findLatestPayment = async (orderId, tx = prisma) => {
    return await tx.orderPayment.findFirst({
        where: { orderId: parseInt(orderId, 10) },
        orderBy: { installmentNo: 'desc' }
    });
};

module.exports = {
    createPayment,
    findPaymentsByOrderId,
    calculateTotalPaid,
    countPaymentsByOrderId,
    findPaymentById,
    updatePayment,
    deletePayment,
    findLatestPayment
};
