const prisma = require('../config/prisma');

const DEFAULT_ORDER_INCLUDE = {
    details: true,
    payments: { orderBy: { installmentNo: 'asc' } },
    storageLocation: true
};

const DEFAULT_DETAIL_INCLUDE = {
    details: true,
    payments: { orderBy: { installmentNo: 'asc' } },
    designer: { select: { staff: { select: { nama: true } }, username: true } },
    storageLocation: true
};

/**
 * Check if an orderId (e.g. ORD-xxx) already exists in the database.
 */
const checkOrderIdExists = async (orderId, tx = prisma) => {
    const found = await tx.jerseyOrder.findUnique({
        where: { orderId },
        select: { id: true }
    });
    return Boolean(found);
};

const createOrder = async (orderData, details, tx = prisma) => {
    return await tx.jerseyOrder.create({
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

const findOrderById = async (id, include = DEFAULT_ORDER_INCLUDE, tx = prisma) => {
    const query = {
        where: { id: parseInt(id, 10) }
    };
    if (include) query.include = include;
    return await tx.jerseyOrder.findUnique(query);
};

const findOrderByOrderId = async (orderId, include = DEFAULT_DETAIL_INCLUDE, tx = prisma) => {
    const query = {
        where: { orderId }
    };
    if (include) query.include = include;
    return await tx.jerseyOrder.findUnique(query);
};

const findOrderByOrderIdCaseInsensitive = async (orderId, include = DEFAULT_DETAIL_INCLUDE, tx = prisma) => {
    const query = {
        where: {
            orderId: {
                equals: orderId,
                mode: 'insensitive'
            }
        }
    };
    if (include) query.include = include;
    return await tx.jerseyOrder.findFirst(query);
};

const findOrders = async (where = {}, include = null, orderBy = { createdAt: 'desc' }, tx = prisma) => {
    const query = { where, orderBy };
    if (include) query.include = include;
    return await tx.jerseyOrder.findMany(query);
};

const findOrdersWithFilters = async ({ search, status, storageLocationId, matchingUserIds = [] } = {}, tx = prisma) => {
    const where = {};

    if (status && status !== 'ALL' && status !== 'SEMUA') {
        if (status === 'MENUNGGU') {
            where.status = { in: ['MENUNGGU', 'MENUNGGU VERIFIKASI'] };
        } else {
            where.status = status;
        }
    }

    if (storageLocationId !== undefined && storageLocationId !== null && storageLocationId !== '') {
        const locStr = String(storageLocationId).trim().toLowerCase();
        if (locStr === 'unassigned' || locStr === 'null' || locStr === 'none') {
            where.storageLocationId = null;
        } else {
            const parsedLoc = parseInt(locStr, 10);
            if (!isNaN(parsedLoc)) {
                where.storageLocationId = parsedLoc;
            }
        }
    }

    if (search && search.trim()) {
        const queryText = search.trim();
        where.OR = [
            { orderId: { contains: queryText, mode: 'insensitive' } },
            { queueNumber: { contains: queryText, mode: 'insensitive' } },
            { customerName: { contains: queryText, mode: 'insensitive' } },
            ...(matchingUserIds.length > 0 ? [{ customerId: { in: matchingUserIds } }] : []),
            {
                details: {
                    some: {
                        OR: [
                            { playerName: { contains: queryText, mode: 'insensitive' } },
                            { playerNumber: { contains: queryText, mode: 'insensitive' } },
                            { playerSize: { contains: queryText, mode: 'insensitive' } },
                            { productTitle: { contains: queryText, mode: 'insensitive' } }
                        ]
                    }
                }
            },
            {
                storageLocation: {
                    OR: [
                        { name: { contains: queryText, mode: 'insensitive' } },
                        { code: { contains: queryText, mode: 'insensitive' } }
                    ]
                }
            }
        ];
    }

    return await tx.jerseyOrder.findMany({
        where,
        include: {
            details: true,
            designer: { select: { staff: { select: { nama: true } }, username: true } },
            payments: { orderBy: { installmentNo: 'asc' } },
            storageLocation: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

const findOrdersByCustomerId = async (customerId, include = DEFAULT_ORDER_INCLUDE, orderBy = { createdAt: 'desc' }, tx = prisma) => {
    return await tx.jerseyOrder.findMany({
        where: { customerId: parseInt(customerId, 10) },
        include: include || DEFAULT_ORDER_INCLUDE,
        orderBy
    });
};

const findOrdersByDesignerId = async (designerId, include = DEFAULT_ORDER_INCLUDE, orderBy = { createdAt: 'desc' }, tx = prisma) => {
    return await tx.jerseyOrder.findMany({
        where: { designerId: parseInt(designerId, 10) },
        include: include || DEFAULT_ORDER_INCLUDE,
        orderBy
    });
};

const updateOrder = async (id, data, include = null, tx = prisma) => {
    const query = {
        where: { id: parseInt(id, 10) },
        data
    };
    if (include) query.include = include;
    return await tx.jerseyOrder.update(query);
};

const updateDesignStatus = async (id, { mockupUrl, designStatus, designFeedback }, tx = prisma) => {
    const data = {};
    if (mockupUrl !== undefined) data.mockupUrl = mockupUrl;
    if (designStatus !== undefined) data.designStatus = designStatus;
    if (designFeedback !== undefined) data.designFeedback = designFeedback;

    return await tx.jerseyOrder.update({
        where: { id: parseInt(id, 10) },
        data
    });
};

const updateLayoutStatus = async (id, { layoutUrl, layoutStatus, layoutFeedback }, tx = prisma) => {
    const data = {};
    if (layoutUrl !== undefined) data.layoutUrl = layoutUrl;
    if (layoutStatus !== undefined) data.layoutStatus = layoutStatus;
    if (layoutFeedback !== undefined) data.layoutFeedback = layoutFeedback;

    return await tx.jerseyOrder.update({
        where: { id: parseInt(id, 10) },
        data
    });
};

const updateProductionMedia = async (id, data, tx = prisma) => {
    return await tx.jerseyOrder.update({
        where: { id: parseInt(id, 10) },
        data
    });
};

const updateOrderStorageLocation = async (id, storageLocationId, tx = prisma) => {
    const numericLocId = storageLocationId !== null && storageLocationId !== undefined
        ? parseInt(storageLocationId, 10)
        : null;

    return await tx.jerseyOrder.update({
        where: { id: parseInt(id, 10) },
        data: { storageLocationId: numericLocId },
        include: { storageLocation: true }
    });
};

const findLastOrderWithQueue = async (tx = prisma) => {
    return await tx.jerseyOrder.findFirst({
        where: { queueNumber: { not: null } },
        orderBy: { id: 'desc' }
    });
};

const runTransaction = async (callback) => {
    return await prisma.$transaction(callback);
};

const findOrderDetailById = async (detailId, tx = prisma) => {
    return await tx.jerseyOrderDetail.findUnique({
        where: { id: parseInt(detailId, 10) }
    });
};

const createOrderDetail = async (data, tx = prisma) => {
    return await tx.jerseyOrderDetail.create({
        data
    });
};

const updateOrderDetail = async (detailId, data, tx = prisma) => {
    return await tx.jerseyOrderDetail.update({
        where: { id: parseInt(detailId, 10) },
        data
    });
};

const deleteOrderDetail = async (detailId, tx = prisma) => {
    return await tx.jerseyOrderDetail.delete({
        where: { id: parseInt(detailId, 10) }
    });
};

const deleteOrderDetailsByOrderId = async (orderId, tx = prisma) => {
    return await tx.jerseyOrderDetail.deleteMany({
        where: { orderId: parseInt(orderId, 10) }
    });
};

const updateManyOrderDetails = async (orderId, data, tx = prisma) => {
    return await tx.jerseyOrderDetail.updateMany({
        where: { orderId: parseInt(orderId, 10) },
        data
    });
};

const updateDamagedPcs = async (orderId, incrementPcs, tx = prisma) => {
    const order = await tx.jerseyOrder.findUnique({
        where: { id: parseInt(orderId, 10) },
        select: { damagedPcs: true }
    });
    const currentDamaged = order ? (order.damagedPcs || 0) : 0;
    const newDamaged = Math.max(0, currentDamaged + incrementPcs);

    return await tx.jerseyOrder.update({
        where: { id: parseInt(orderId, 10) },
        data: { damagedPcs: newDamaged }
    });
};

module.exports = {
    DEFAULT_ORDER_INCLUDE,
    DEFAULT_DETAIL_INCLUDE,
    checkOrderIdExists,
    createOrder,
    findOrderById,
    findOrderByOrderId,
    findOrderByOrderIdCaseInsensitive,
    findOrders,
    findOrdersWithFilters,
    findOrdersByCustomerId,
    findOrdersByDesignerId,
    updateOrder,
    updateDesignStatus,
    updateLayoutStatus,
    updateProductionMedia,
    updateOrderStorageLocation,
    findLastOrderWithQueue,
    runTransaction,
    findOrderDetailById,
    createOrderDetail,
    updateOrderDetail,
    deleteOrderDetail,
    deleteOrderDetailsByOrderId,
    updateManyOrderDetails,
    updateDamagedPcs
};
