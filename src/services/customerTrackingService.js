const prisma = require('../config/prisma');

/**
 * Normalizes Indonesian phone numbers into a canonical 08... format with digits only.
 * Examples:
 *   "+62 812-3456-7890" -> "081234567890"
 *   "6281234567890"     -> "081234567890"
 *   "81234567890"       -> "081234567890"
 *   "0812-3456-7890"    -> "081234567890"
 */
function normalizeCustomerPhone(raw) {
    if (!raw) return '';
    let digits = String(raw).replace(/\D/g, '').trim();
    if (!digits) return '';
    if (digits.startsWith('62')) {
        digits = '0' + digits.slice(2);
    } else if (digits.startsWith('8')) {
        digits = '0' + digits;
    }
    return digits;
}

/**
 * Searches customer suggestions for autocomplete during order entry.
 * Aggregates cumulative order count and total spend (LTV) across all past orders.
 */
const searchCustomerSuggestions = async (query) => {
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
        return [];
    }

    const trimmedQuery = query.trim();
    const rawDigits = trimmedQuery.replace(/\D/g, '');

    const whereConditions = [
        { customerName: { contains: trimmedQuery, mode: 'insensitive' } }
    ];

    if (rawDigits.length >= 2) {
        whereConditions.push({ customerPhone: { contains: rawDigits } });
        if (rawDigits.startsWith('62')) {
            whereConditions.push({ customerPhone: { contains: '0' + rawDigits.slice(2) } });
        } else if (rawDigits.startsWith('0')) {
            whereConditions.push({ customerPhone: { contains: '62' + rawDigits.slice(1) } });
            whereConditions.push({ customerPhone: { contains: rawDigits.slice(1) } });
        } else if (rawDigits.startsWith('8')) {
            whereConditions.push({ customerPhone: { contains: '0' + rawDigits } });
            whereConditions.push({ customerPhone: { contains: '62' + rawDigits } });
        }
    }

    // Match registered customer users
    const matchedUsers = await prisma.user.findMany({
        where: {
            role: 'customer',
            OR: [
                { username: { contains: trimmedQuery, mode: 'insensitive' } },
                { customer: { nama: { contains: trimmedQuery, mode: 'insensitive' } } },
                ...(rawDigits.length >= 2 ? [{ customer: { phone: { contains: rawDigits } } }] : [])
            ]
        },
        select: {
            id: true,
            username: true,
            customer: { select: { nama: true, phone: true } }
        }
    });

    const matchedUserIds = matchedUsers.map(u => u.id);
    if (matchedUserIds.length > 0) {
        whereConditions.push({ customerId: { in: matchedUserIds } });
    }

    // Fetch initial matching candidate orders
    const candidateOrders = await prisma.jerseyOrder.findMany({
        where: {
            OR: whereConditions,
            NOT: { orderId: { startsWith: 'SEED-' } }
        },
        select: {
            id: true,
            orderId: true,
            customerId: true,
            customerName: true,
            customerPhone: true,
            totalAmount: true,
            status: true,
            createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    });

    const candidatePhones = new Set();
    const candidateNames = new Set();
    const candidateUserIds = new Set();

    for (const o of candidateOrders) {
        const normPhone = normalizeCustomerPhone(o.customerPhone);
        if (normPhone && normPhone.length >= 8) {
            candidatePhones.add(normPhone);
            if (o.customerPhone) candidatePhones.add(o.customerPhone.trim());
        } else if (o.customerName && o.customerName.trim()) {
            candidateNames.add(o.customerName.trim());
        }
        if (o.customerId) {
            candidateUserIds.add(o.customerId);
        }
    }

    // If registered users matched without orders, return zero-order profiles
    if (candidateOrders.length === 0 && matchedUsers.length > 0) {
        return matchedUsers.map(u => ({
            customerName: u.customer?.nama || u.username,
            customerPhone: u.customer?.phone ? normalizeCustomerPhone(u.customer.phone) : null,
            totalOrders: 0,
            totalSpent: 0,
            lastOrderDate: null,
            recentOrders: []
        }));
    }

    if (candidatePhones.size === 0 && candidateNames.size === 0 && candidateUserIds.size === 0) {
        return [];
    }

    // Fetch ALL orders belonging to identified candidates to compute true cumulative totals
    const allOrders = await prisma.jerseyOrder.findMany({
        where: {
            OR: [
                ...(candidatePhones.size > 0 ? [{ customerPhone: { in: Array.from(candidatePhones) } }] : []),
                ...(candidateNames.size > 0 ? [{ customerName: { in: Array.from(candidateNames), mode: 'insensitive' } }] : []),
                ...(candidateUserIds.size > 0 ? [{ customerId: { in: Array.from(candidateUserIds) } }] : [])
            ],
            NOT: { orderId: { startsWith: 'SEED-' } }
        },
        select: {
            id: true,
            orderId: true,
            customerId: true,
            customerName: true,
            customerPhone: true,
            totalAmount: true,
            status: true,
            createdAt: true
        },
        orderBy: { createdAt: 'desc' }
    });

    const customerMap = new Map();

    for (const order of allOrders) {
        const normPhone = normalizeCustomerPhone(order.customerPhone);
        const normName = (order.customerName || '').trim().toLowerCase();

        let groupKey = '';
        if (normPhone && normPhone.length >= 8) {
            groupKey = `phone:${normPhone}`;
        } else if (order.customerId) {
            groupKey = `user:${order.customerId}`;
        } else if (normName) {
            groupKey = `name:${normName}`;
        } else {
            continue;
        }

        if (!customerMap.has(groupKey)) {
            customerMap.set(groupKey, {
                key: groupKey,
                customerName: order.customerName || 'Pelanggan',
                customerPhone: normPhone || order.customerPhone || null,
                orders: []
            });
        }

        const group = customerMap.get(groupKey);
        if (order.customerName && (!group.customerName || order.customerName.length > group.customerName.length)) {
            group.customerName = order.customerName.trim();
        }
        if (normPhone && !group.customerPhone) {
            group.customerPhone = normPhone;
        }
        group.orders.push(order);
    }

    const suggestions = Array.from(customerMap.values()).map(group => {
        const totalOrders = group.orders.length;
        const validOrders = group.orders.filter(o => o.status !== 'DITOLAK' && o.status !== 'BATAL');
        const totalSpent = validOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
        const lastOrderDate = group.orders[0]?.createdAt ? group.orders[0].createdAt.toISOString() : null;
        const recentOrders = group.orders.slice(0, 3).map(o => ({
            orderId: o.orderId,
            totalAmount: Number(o.totalAmount) || 0,
            status: o.status,
            createdAt: o.createdAt
        }));

        return {
            customerName: group.customerName,
            customerPhone: group.customerPhone,
            totalOrders,
            totalSpent,
            lastOrderDate,
            recentOrders
        };
    });

    suggestions.sort((a, b) => b.totalOrders - a.totalOrders || b.totalSpent - a.totalSpent);
    return suggestions.slice(0, 10);
};

/**
 * Returns full chronological order history and cumulative stats for a customer.
 */
const getCustomerOrderHistory = async ({ phone, name, customerId } = {}) => {
    const normPhone = normalizeCustomerPhone(phone);
    const hasPhone = Boolean(normPhone && normPhone.length >= 8);
    const hasName = Boolean(name && typeof name === 'string' && name.trim());
    const hasCustId = Boolean(customerId && !isNaN(parseInt(customerId, 10)));

    if (!hasPhone && !hasName && !hasCustId) {
        const error = new Error('Parameter phone, name, atau customerId wajib diisi');
        error.statusCode = 400;
        throw error;
    }

    const whereConditions = [];
    if (hasPhone) {
        whereConditions.push({ customerPhone: normPhone });
        const rawDigits = String(phone).replace(/\D/g, '');
        if (rawDigits !== normPhone) {
            whereConditions.push({ customerPhone: rawDigits });
        }
        const sigDigits = normPhone.startsWith('0') ? normPhone.slice(1) : normPhone;
        whereConditions.push({ customerPhone: { contains: sigDigits } });
    }
    if (hasName) {
        whereConditions.push({
            customerName: {
                contains: name.trim(),
                mode: 'insensitive'
            }
        });
    }
    if (hasCustId) {
        whereConditions.push({ customerId: parseInt(customerId, 10) });
    }

    const orders = await prisma.jerseyOrder.findMany({
        where: {
            OR: whereConditions,
            NOT: { orderId: { startsWith: 'SEED-' } }
        },
        include: {
            details: {
                select: {
                    id: true,
                    productTitle: true,
                    playerName: true,
                    playerNumber: true,
                    playerSize: true,
                    unitPrice: true,
                    statusBaju: true,
                    statusCelana: true
                }
            },
            payments: {
                orderBy: { installmentNo: 'asc' },
                select: {
                    id: true,
                    installmentNo: true,
                    stage: true,
                    amount: true,
                    paymentMethod: true,
                    createdAt: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const totalOrders = orders.length;
    const validOrders = orders.filter(o => o.status !== 'DITOLAK' && o.status !== 'BATAL');
    const totalSpent = validOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const averageOrderValue = validOrders.length > 0 ? Math.round(totalSpent / validOrders.length) : 0;
    const firstOrderDate = orders.length > 0 ? orders[orders.length - 1].createdAt : null;
    const lastOrderDate = orders.length > 0 ? orders[0].createdAt : null;

    const statusBreakdown = orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
    }, {});

    const resolvedName = orders.find(o => o.customerName)?.customerName || name || 'Pelanggan';
    const resolvedPhone = orders.find(o => o.customerPhone)?.customerPhone || normPhone || null;

    return {
        customer: {
            customerName: resolvedName,
            customerPhone: resolvedPhone,
            totalOrders,
            totalSpent,
            averageOrderValue,
            firstOrderDate,
            lastOrderDate,
            statusBreakdown
        },
        orders: orders.map(o => ({
            id: o.id,
            orderId: o.orderId,
            createdAt: o.createdAt,
            status: o.status,
            totalAmount: o.totalAmount,
            paidAmount: o.paidAmount,
            remainingAmount: o.remainingAmount,
            materialName: o.materialName,
            materialPrice: o.materialPrice,
            itemCount: o.details?.length || 0,
            details: o.details,
            payments: o.payments
        }))
    };
};

module.exports = {
    normalizeCustomerPhone,
    searchCustomerSuggestions,
    getCustomerOrderHistory
};
