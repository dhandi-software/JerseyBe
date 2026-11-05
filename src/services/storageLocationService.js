const storageLocationRepository = require('../repositories/storageLocationRepository');
const orderRepository = require('../repositories/orderRepository');
const prisma = require('../config/prisma');

/**
 * Normalizes and validates storage location code.
 * Transforms to uppercase and verifies alphanumeric with allowed separators.
 */
function normalizeLocationCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
        const error = new Error('Kode lokasi penyimpanan wajib diisi');
        error.statusCode = 400;
        throw error;
    }
    const cleanCode = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9_\-\.]+$/.test(cleanCode)) {
        const error = new Error('Kode lokasi hanya boleh mengandung huruf kapital, angka, tanda hubung (-), titik, atau garis bawah (_)');
        error.statusCode = 400;
        throw error;
    }
    return cleanCode;
}

/**
 * Normalizes location object for consistent JSON output.
 */
function formatLocationOutput(loc) {
    if (!loc) return null;
    return {
        id: loc.id,
        name: loc.name,
        code: loc.code,
        address: loc.address || null,
        notes: loc.notes || null,
        orderCount: loc._count ? loc._count.orders : (loc.orderCount ?? 0),
        createdAt: loc.createdAt,
        updatedAt: loc.updatedAt
    };
}

/**
 * List all storage locations with live order counts.
 */
const getAllLocations = async () => {
    const locations = await storageLocationRepository.findAll(
        {},
        true,
        { name: 'asc' }
    );
    return locations.map(formatLocationOutput);
};

/**
 * Get a single storage location by ID.
 */
const getLocationById = async (id) => {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        const error = new Error('ID lokasi tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const location = await storageLocationRepository.findById(parsedId, false);
    if (!location) {
        const error = new Error('Lokasi penyimpanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    return formatLocationOutput(location);
};

/**
 * Create a new storage location with code normalization and validation.
 */
const createLocation = async ({ name, code, address, notes }) => {
    if (!name || typeof name !== 'string' || !name.trim()) {
        const error = new Error('Nama lokasi penyimpanan wajib diisi');
        error.statusCode = 400;
        throw error;
    }

    const cleanCode = normalizeLocationCode(code);

    const existing = await storageLocationRepository.findByCode(cleanCode);
    if (existing) {
        const error = new Error(`Kode lokasi '${cleanCode}' sudah digunakan`);
        error.statusCode = 409;
        throw error;
    }

    const newLoc = await storageLocationRepository.create({
        name: name.trim(),
        code: cleanCode,
        address: address && typeof address === 'string' && address.trim() ? address.trim() : null,
        notes: notes && typeof notes === 'string' && notes.trim() ? notes.trim() : null
    });

    return formatLocationOutput({ ...newLoc, _count: { orders: 0 } });
};

/**
 * Update an existing storage location.
 */
const updateLocation = async (id, { name, code, address, notes } = {}) => {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        const error = new Error('ID lokasi tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const existing = await storageLocationRepository.findById(parsedId);
    if (!existing) {
        const error = new Error('Lokasi penyimpanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const dataUpdate = {};

    if (name !== undefined) {
        if (!name || typeof name !== 'string' || !name.trim()) {
            const error = new Error('Nama lokasi penyimpanan tidak boleh kosong');
            error.statusCode = 400;
            throw error;
        }
        dataUpdate.name = name.trim();
    }

    if (code !== undefined) {
        const cleanCode = normalizeLocationCode(code);
        if (cleanCode !== existing.code) {
            const duplicate = await storageLocationRepository.findByCode(cleanCode);
            if (duplicate && duplicate.id !== parsedId) {
                const error = new Error(`Kode lokasi '${cleanCode}' sudah digunakan`);
                error.statusCode = 409;
                throw error;
            }
        }
        dataUpdate.code = cleanCode;
    }

    if (address !== undefined) {
        dataUpdate.address = address && typeof address === 'string' && address.trim() ? address.trim() : null;
    }

    if (notes !== undefined) {
        dataUpdate.notes = notes && typeof notes === 'string' && notes.trim() ? notes.trim() : null;
    }

    const updated = await storageLocationRepository.update(parsedId, dataUpdate);
    const orderCount = await storageLocationRepository.countOrdersByLocation(parsedId);

    return formatLocationOutput({ ...updated, _count: { orders: orderCount } });
};

/**
 * Delete a storage location safely (prevents deletion if orders are assigned).
 */
const deleteLocation = async (id) => {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        const error = new Error('ID lokasi tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const existing = await storageLocationRepository.findById(parsedId);
    if (!existing) {
        const error = new Error('Lokasi penyimpanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const orderCount = await storageLocationRepository.countOrdersByLocation(parsedId);
    if (orderCount > 0) {
        const error = new Error(`Tidak dapat menghapus lokasi '${existing.name}' karena terdapat ${orderCount} pesanan yang sedang tersimpan di lokasi ini.`);
        error.statusCode = 400;
        throw error;
    }

    await storageLocationRepository.deleteById(parsedId);
    return {
        success: true,
        message: `Lokasi penyimpanan '${existing.name}' (${existing.code}) berhasil dihapus.`
    };
};

/**
 * Assign or unassign an order to/from a storage location.
 */
const assignOrderLocation = async (orderIdentifier, storageLocationId) => {
    let order = null;
    const isNumericId = /^\d+$/.test(String(orderIdentifier).trim());

    if (isNumericId) {
        order = await orderRepository.findOrderById(parseInt(orderIdentifier, 10), { details: true });
    } else {
        order = await orderRepository.findOrderByOrderId(String(orderIdentifier).trim(), { details: true });
    }

    if (!order) {
        const error = new Error('Pesanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    // Handle Unassignment
    if (
        storageLocationId === null ||
        storageLocationId === undefined ||
        storageLocationId === '' ||
        storageLocationId === 'null' ||
        storageLocationId === 'unassigned'
    ) {
        const updated = await prisma.jerseyOrder.update({
            where: { id: order.id },
            data: { storageLocationId: null },
            include: {
                storageLocation: true,
                details: true
            }
        });
        return updated;
    }

    // Handle Assignment Guard (strictly reject assigning cancelled orders to a storage location)
    if (order.status === 'BATAL') {
        const error = new Error('Tidak dapat menetapkan lokasi penyimpanan untuk pesanan yang telah dibatalkan');
        error.statusCode = 400;
        throw error;
    }

    // Handle Assignment
    const parsedLocId = parseInt(storageLocationId, 10);
    if (isNaN(parsedLocId)) {
        const error = new Error('ID lokasi penyimpanan tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const location = await storageLocationRepository.findById(parsedLocId);
    if (!location) {
        const error = new Error('Lokasi penyimpanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const updated = await prisma.jerseyOrder.update({
        where: { id: order.id },
        data: { storageLocationId: parsedLocId },
        include: {
            storageLocation: true,
            details: true
        }
    });

    return updated;
};

module.exports = {
    normalizeLocationCode,
    getAllLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation,
    assignOrderLocation
};
