const prisma = require('../config/prisma');

const createOrder = async (orderData, details) => {
    return await prisma.jerseyOrder.create({
        data: {
            ...orderData,
            details: {
                create: details
            }
        },
        include: {
            details: true
        }
    });
};

const findOrderById = async (id, include = { details: true }) => {
    return await prisma.jerseyOrder.findUnique({
        where: { id: parseInt(id) },
        include
    });
};

const findOrderByOrderId = async (orderId, include = { details: true, designer: { select: { staff: { select: { nama: true } }, username: true } } }) => {
    return await prisma.jerseyOrder.findUnique({
        where: { orderId },
        include
    });
};

const findOrders = async (where = {}, include = null, orderBy = { createdAt: 'desc' }) => {
    const query = { where, orderBy };
    if (include) query.include = include;
    return await prisma.jerseyOrder.findMany(query);
};

const updateOrder = async (id, data, include = null) => {
    const query = {
        where: { id: parseInt(id) },
        data
    };
    if (include) query.include = include;
    return await prisma.jerseyOrder.update(query);
};

const findLastOrderWithQueue = async (tx = prisma) => {
    return await tx.jerseyOrder.findFirst({
        where: { queueNumber: { not: null } },
        orderBy: { id: 'desc' }
    });
};

const createDamageHistory = async (data, tx = prisma) => {
    return await tx.orderDamageHistory.create({ data });
};

const updateDamageHistory = async (id, data, tx = prisma) => {
    return await tx.orderDamageHistory.update({
        where: { id: parseInt(id) },
        data
    });
};

const findDamageHistoryById = async (id) => {
    return await prisma.orderDamageHistory.findUnique({
        where: { id: parseInt(id) },
        include: { order: true }
    });
};

const findDamageHistoryByOrderId = async (orderId) => {
    return await prisma.orderDamageHistory.findMany({
        where: { orderId: parseInt(orderId) },
        orderBy: { createdAt: 'desc' }
    });
};

const runTransaction = async (callback) => {
    return await prisma.$transaction(callback);
};

const findOrderDetailById = async (detailId) => {
    return await prisma.jerseyOrderDetail.findUnique({
        where: { id: parseInt(detailId) }
    });
};

const createOrderDetail = async (data) => {
    return await prisma.jerseyOrderDetail.create({
        data
    });
};

const updateOrderDetail = async (detailId, data) => {
    return await prisma.jerseyOrderDetail.update({
        where: { id: parseInt(detailId) },
        data
    });
};

const deleteOrderDetail = async (detailId) => {
    return await prisma.jerseyOrderDetail.delete({
        where: { id: parseInt(detailId) }
    });
};

module.exports = {
    createOrder,
    findOrderById,
    findOrderByOrderId,
    findOrders,
    updateOrder,
    findOrderDetailById,
    createOrderDetail,
    updateOrderDetail,
    deleteOrderDetail,
    findLastOrderWithQueue,
    createDamageHistory,
    updateDamageHistory,
    findDamageHistoryById,
    findDamageHistoryByOrderId,
    runTransaction
};
