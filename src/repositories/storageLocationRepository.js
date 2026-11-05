const prisma = require('../config/prisma');

/**
 * Retrieve all storage locations with optional order count aggregation.
 * @param {Object} where - Optional Prisma where clause (e.g. search filter)
 * @param {boolean} includeOrdersCount - Whether to include order count (default true)
 * @param {Object} orderBy - Ordering options (default { createdAt: 'desc' })
 */
const findAll = async (where = {}, includeOrdersCount = true, orderBy = { createdAt: 'desc' }) => {
    const query = {
        where,
        orderBy
    };

    if (includeOrdersCount) {
        query.include = {
            _count: {
                select: { orders: true }
            }
        };
    }

    const locations = await prisma.storageLocation.findMany(query);

    if (includeOrdersCount) {
        return locations.map(loc => ({
            id: loc.id,
            name: loc.name,
            code: loc.code,
            address: loc.address,
            notes: loc.notes,
            createdAt: loc.createdAt,
            updatedAt: loc.updatedAt,
            orderCount: loc._count ? loc._count.orders : 0
        }));
    }

    return locations;
};

/**
 * Find a storage location by primary key ID.
 * @param {number|string} id - Storage location numeric ID
 * @param {boolean} includeOrders - Whether to eagerly load order records
 */
const findById = async (id, includeOrders = false) => {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return null;

    const query = {
        where: { id: numericId }
    };

    if (includeOrders) {
        query.include = {
            orders: {
                select: {
                    id: true,
                    orderId: true,
                    status: true,
                    customerName: true,
                    customerPhone: true,
                    totalAmount: true,
                    createdAt: true
                },
                orderBy: { createdAt: 'desc' }
            },
            _count: {
                select: { orders: true }
            }
        };
    } else {
        query.include = {
            _count: {
                select: { orders: true }
            }
        };
    }

    const loc = await prisma.storageLocation.findUnique(query);
    if (!loc) return null;

    return {
        ...loc,
        orderCount: loc._count ? loc._count.orders : 0
    };
};

/**
 * Find a storage location by its unique code (case-insensitive normalized).
 * @param {string} code - Storage code (e.g. "GDG-01")
 */
const findByCode = async (code) => {
    if (typeof code !== 'string' || !code.trim()) {
        return null;
    }
    const cleanCode = code.trim().toUpperCase();
    return await prisma.storageLocation.findUnique({
        where: { code: cleanCode }
    });
};

/**
 * Create a new storage location.
 * @param {Object} data - { name, code, address, notes }
 */
const create = async (data) => {
    const cleanData = {
        name: data.name ? data.name.trim() : '',
        code: data.code ? data.code.trim().toUpperCase() : '',
        address: data.address !== undefined ? data.address : null,
        notes: data.notes !== undefined ? data.notes : null
    };

    return await prisma.storageLocation.create({
        data: cleanData
    });
};

/**
 * Update an existing storage location.
 * @param {number|string} id - Storage location ID
 * @param {Object} data - Fields to update
 */
const update = async (id, data) => {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        const err = new Error('Invalid storage location ID');
        err.statusCode = 400;
        throw err;
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.code !== undefined) updateData.code = data.code.trim().toUpperCase();
    if (data.address !== undefined) updateData.address = data.address;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return await prisma.storageLocation.update({
        where: { id: numericId },
        data: updateData
    });
};

/**
 * Delete a storage location by ID.
 * @param {number|string} id - Storage location ID
 */
const deleteById = async (id) => {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        const err = new Error('Invalid storage location ID');
        err.statusCode = 400;
        throw err;
    }

    return await prisma.storageLocation.delete({
        where: { id: numericId }
    });
};

/**
 * Count orders associated with a storage location.
 * @param {number|string} locationId - Storage location ID
 * @param {boolean} filterActiveOnly - If true, count only non-completed orders
 */
const countOrdersByLocation = async (locationId, filterActiveOnly = false) => {
    const numericId = parseInt(locationId, 10);
    if (isNaN(numericId)) return 0;

    const where = {
        storageLocationId: numericId
    };

    if (filterActiveOnly) {
        where.status = { not: 'SELESAI' };
    }

    return await prisma.jerseyOrder.count({ where });
};

/**
 * Helper to assign or unassign a storage location to an order.
 * @param {number|string} orderId - Order primary ID
 * @param {number|string|null} storageLocationId - Location ID or null to unassign
 */
const assignOrder = async (orderId, storageLocationId) => {
    const numericOrderId = parseInt(orderId, 10);
    const numericLocationId = storageLocationId !== null && storageLocationId !== undefined
        ? parseInt(storageLocationId, 10)
        : null;

    return await prisma.jerseyOrder.update({
        where: { id: numericOrderId },
        data: { storageLocationId: numericLocationId },
        include: { storageLocation: true }
    });
};

module.exports = {
    findAll,
    findById,
    findByCode,
    create,
    update,
    deleteById,
    countOrdersByLocation,
    assignOrder
};
