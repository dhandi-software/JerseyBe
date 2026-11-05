const orderRepository = require('../../repositories/orderRepository');
const orderPaymentRepository = require('../../repositories/orderPaymentRepository');
const { assertOrderOwnerOrStaff, normalizeOrderPaymentFields } = require('./orderCommon');

/**
 * Update payment fields (paidAmount, remainingAmount, paymentType, paymentUrl)
 * with caller authorization checks and payment URL validation.
 */
const updatePayment = async (id, paymentData, callerUser = null) => {
    const current = await assertOrderOwnerOrStaff(id, callerUser);
    const total = Number(current?.totalAmount) || 0;
    const isCustomerCaller = (callerUser?.role || '').toLowerCase() === 'customer';
    let dataToUpdate = {};

    if (typeof paymentData === 'object' && paymentData !== null) {
        if (paymentData.paymentUrl !== undefined) {
            if (isCustomerCaller && (paymentData.paymentUrl === 'LUNAS_ADMIN' || paymentData.paymentUrl === 'DP_TERKONFIRMASI_ADMIN')) {
                const error = new Error('Forbidden: Status pembayaran tidak valid');
                error.statusCode = 403;
                throw error;
            }
            dataToUpdate.paymentUrl = paymentData.paymentUrl;
        }
        if (!isCustomerCaller) {
            if (paymentData.paymentType !== undefined) dataToUpdate.paymentType = paymentData.paymentType;
            if (paymentData.paidAmount !== undefined) dataToUpdate.paidAmount = parseFloat(paymentData.paidAmount) || 0;
            if (paymentData.remainingAmount !== undefined) {
                dataToUpdate.remainingAmount = parseFloat(paymentData.remainingAmount) || 0;
            } else if (paymentData.paidAmount !== undefined) {
                dataToUpdate.remainingAmount = Math.max(0, total - dataToUpdate.paidAmount);
            }

            if (dataToUpdate.paymentUrl === undefined && current) {
                const isPlaceholderUrl = current.paymentUrl === 'MENUNGGU_PEMBAYARAN_ADMIN' || current.paymentUrl === 'DP_TERKONFIRMASI_ADMIN' || current.paymentUrl === 'LUNAS_ADMIN';
                if (isPlaceholderUrl) {
                    const effectivePaid = dataToUpdate.paidAmount !== undefined ? dataToUpdate.paidAmount : (Number(current.paidAmount) || 0);
                    const effectiveRem = dataToUpdate.remainingAmount !== undefined ? dataToUpdate.remainingAmount : Math.max(0, total - effectivePaid);
                    dataToUpdate.paymentUrl = effectiveRem <= 0 && effectivePaid >= total ? 'LUNAS_ADMIN' : 'DP_TERKONFIRMASI_ADMIN';
                }
            }
        }
    } else if (typeof paymentData === 'string') {
        dataToUpdate.paymentUrl = paymentData;
    }

    const updated = await orderRepository.updateOrder(id, dataToUpdate, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    });
    return normalizeOrderPaymentFields(updated);
};

/**
 * Multi-stage down payment recording:
 * Validates remaining balance, records installment, and synchronizes order balance.
 */
const addPaymentInstallment = async (id, paymentData = {}, callerUser = null) => {
    const orderIdInt = parseInt(id, 10);
    if (isNaN(orderIdInt) || orderIdInt <= 0) {
        const error = new Error('Invalid order ID');
        error.statusCode = 400;
        throw error;
    }

    await assertOrderOwnerOrStaff(orderIdInt, callerUser);

    const numAmount = Number(paymentData.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
        const error = new Error('Payment amount must be a positive number');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.runTransaction(async (tx) => {
        const order = await orderRepository.findOrderById(orderIdInt, {
            payments: { orderBy: { installmentNo: 'asc' } }
        }, tx);
        if (!order) {
            const error = new Error('Order not found');
            error.statusCode = 404;
            throw error;
        }

        const existingPayments = order.payments || [];
        const existingPaid = existingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const orderTotal = Number(order.totalAmount) || 0;
        const currentRemaining = Math.max(0, orderTotal - existingPaid);

        if (numAmount > currentRemaining) {
            const error = new Error(
                `Payment amount (Rp ${numAmount.toLocaleString('id-ID')}) exceeds remaining balance (Rp ${currentRemaining.toLocaleString('id-ID')})`
            );
            error.statusCode = 400;
            throw error;
        }

        const installmentNo = existingPayments.length + 1;
        const isSettled = (currentRemaining - numAmount === 0);
        const resolvedStage = isSettled ? 'PELUNASAN' : (paymentData.stage || 'DP');

        const newPayment = await orderPaymentRepository.createPayment({
            orderId: orderIdInt,
            installmentNo,
            stage: resolvedStage,
            amount: numAmount,
            paymentMethod: paymentData.paymentMethod ? String(paymentData.paymentMethod).trim() : 'TRANSFER',
            proofUrl: paymentData.proofUrl ? String(paymentData.proofUrl).trim() : null,
            notes: paymentData.notes ? String(paymentData.notes).trim() : null
        }, tx);

        const newPaidAmount = await orderPaymentRepository.calculateTotalPaid(orderIdInt, tx);
        const newRemainingAmount = Math.max(0, orderTotal - newPaidAmount);
        const newPaymentType = newRemainingAmount === 0 ? 'FULL' : 'DP';

        const orderUpdateData = {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            paymentType: newPaymentType
        };

        if (paymentData.proofUrl) {
            orderUpdateData.paymentUrl = paymentData.proofUrl;
        }

        const updatedOrder = await orderRepository.updateOrder(orderIdInt, orderUpdateData, null, tx);

        return {
            success: true,
            payment: newPayment,
            order: {
                id: updatedOrder.id,
                orderId: updatedOrder.orderId,
                totalAmount: updatedOrder.totalAmount,
                paidAmount: updatedOrder.paidAmount,
                remainingAmount: updatedOrder.remainingAmount,
                paymentType: updatedOrder.paymentType,
                paymentUrl: updatedOrder.paymentUrl
            }
        };
    });
};

/**
 * Retrieve all payment installments for an order, sorted by installment sequence.
 */
const getPaymentInstallments = async (id, callerUser = null) => {
    const orderIdInt = parseInt(id, 10);
    if (isNaN(orderIdInt) || orderIdInt <= 0) {
        const error = new Error('Invalid order ID');
        error.statusCode = 400;
        throw error;
    }

    await assertOrderOwnerOrStaff(orderIdInt, callerUser);

    return await orderPaymentRepository.findPaymentsByOrderId(orderIdInt);
};

module.exports = {
    updatePayment,
    addPaymentInstallment,
    getPaymentInstallments
};
