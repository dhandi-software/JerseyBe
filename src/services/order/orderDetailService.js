const orderRepository = require('../../repositories/orderRepository');
const bahanBajuRepository = require('../../repositories/bahanBajuRepository');
const { parseSizeAndSleeve, getSizeSurcharge } = require('../../utils/orderUtils');

/**
 * Toggle jersey player checklist items (statusBaju, statusCelana).
 */
const updateDetailStatus = async (detailId, { statusBaju, statusCelana }) => {
    const detail = await orderRepository.findOrderDetailById(detailId);
    if (!detail) {
        const error = new Error('Detail anggota tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const dataToUpdate = {};
    if (statusBaju !== undefined) dataToUpdate.statusBaju = Boolean(statusBaju);
    if (statusCelana !== undefined) dataToUpdate.statusCelana = Boolean(statusCelana);

    return await orderRepository.updateOrderDetail(detailId, dataToUpdate);
};

/**
 * Update player name, number, size, and checklist items for an existing detail line.
 */
const updateOrderDetail = async (detailId, { playerName, playerNumber, playerSize, statusBaju, statusCelana }) => {
    const detail = await orderRepository.findOrderDetailById(detailId);
    if (!detail) {
        const error = new Error('Detail anggota tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const dataToUpdate = {};
    if (playerName !== undefined) dataToUpdate.playerName = playerName ? playerName.trim() : detail.playerName;
    if (playerNumber !== undefined) dataToUpdate.playerNumber = playerNumber ? String(playerNumber).trim() : '';
    if (playerSize !== undefined) dataToUpdate.playerSize = playerSize ? playerSize.trim() : detail.playerSize;
    if (statusBaju !== undefined) dataToUpdate.statusBaju = Boolean(statusBaju);
    if (statusCelana !== undefined) dataToUpdate.statusCelana = Boolean(statusCelana);

    return await orderRepository.updateOrderDetail(detailId, dataToUpdate);
};

/**
 * Append player detail item, compute unit price with size surcharge,
 * update order subtotal, total, and remaining balance.
 */
const addOrderDetail = async (orderId, { playerName, playerNumber, playerSize, statusBaju, statusCelana }) => {
    const orderIdInt = parseInt(orderId, 10);
    const order = await orderRepository.findOrderById(orderIdInt);
    if (!order) {
        const error = new Error('Pesanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const firstDetail = order.details?.[0];
    const rawSize = playerSize || 'M (Lengan Pendek)';
    const { size } = parseSizeAndSleeve(rawSize);
    const surcharge = getSizeSurcharge(size);

    let baseUnitPrice = order.materialPrice;
    if (!baseUnitPrice && firstDetail?.unitPrice) {
        const firstSize = parseSizeAndSleeve(firstDetail.playerSize).size;
        baseUnitPrice = Math.max(0, firstDetail.unitPrice - getSizeSurcharge(firstSize));
    }
    if (!baseUnitPrice && firstDetail?.productId) {
        const bahan = await bahanBajuRepository.findBahanById(firstDetail.productId);
        if (bahan?.harga) baseUnitPrice = bahan.harga;
    }
    if (!baseUnitPrice) {
        baseUnitPrice = 150000;
    }

    const unitPrice = baseUnitPrice + surcharge;
    const productId = firstDetail?.productId || order.materialId || null;
    const productTitle = firstDetail?.productTitle || order.materialName || 'Custom Jersey';

    const newDetail = await orderRepository.createOrderDetail({
        orderId: orderIdInt,
        productId,
        productTitle,
        playerName: (playerName || 'Pemain Baru').trim(),
        playerNumber: playerNumber ? String(playerNumber).trim() : '',
        playerSize: rawSize.trim(),
        unitPrice,
        statusBaju: Boolean(statusBaju),
        statusCelana: Boolean(statusCelana)
    });

    const newSubtotalAmount = (order.subtotalAmount || order.totalAmount || 0) + unitPrice;
    const orderDiscount = Number(order.discount) || 0;
    const newTotalAmount = Math.max(0, newSubtotalAmount - orderDiscount);

    const updateData = {
        subtotalAmount: newSubtotalAmount,
        totalAmount: newTotalAmount
    };
    if (order.paymentType === 'DP') {
        updateData.remainingAmount = Math.max(0, newTotalAmount - (order.paidAmount || 0));
    }
    await orderRepository.updateOrder(orderIdInt, updateData);

    return {
        ...newDetail,
        unitPrice,
        newTotalAmount,
        subtotalAmount: newSubtotalAmount,
        remainingAmount: updateData.remainingAmount
    };
};

/**
 * Remove player detail item, decrement order subtotal,
 * recalculate total minus discount, and update remaining balance.
 */
const deleteOrderDetail = async (detailId) => {
    const detail = await orderRepository.findOrderDetailById(detailId);
    if (!detail) {
        const error = new Error('Detail anggota tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const order = await orderRepository.findOrderById(detail.orderId);
    let newTotalAmount = 0;
    let newSubtotalAmount = 0;
    let newRemainingAmount = undefined;
    if (order) {
        const itemUnitPrice = detail.unitPrice > 0
            ? detail.unitPrice
            : (order.details?.length ? Math.round(order.totalAmount / order.details.length) : 0);

        const currentSubtotal = order.subtotalAmount || order.totalAmount || 0;
        newSubtotalAmount = Math.max(0, currentSubtotal - itemUnitPrice);
        const orderDiscount = Number(order.discount) || 0;
        newTotalAmount = Math.max(0, newSubtotalAmount - orderDiscount);

        const updateData = {
            subtotalAmount: newSubtotalAmount,
            totalAmount: newTotalAmount
        };
        if (order.paymentType === 'DP') {
            updateData.remainingAmount = Math.max(0, newTotalAmount - (order.paidAmount || 0));
            newRemainingAmount = updateData.remainingAmount;
        }
        await orderRepository.updateOrder(order.id, updateData);
    }

    const deleted = await orderRepository.deleteOrderDetail(detailId);
    return {
        ...deleted,
        newTotalAmount,
        subtotalAmount: newSubtotalAmount,
        remainingAmount: newRemainingAmount
    };
};

module.exports = {
    updateDetailStatus,
    updateOrderDetail,
    addOrderDetail,
    deleteOrderDetail
};
