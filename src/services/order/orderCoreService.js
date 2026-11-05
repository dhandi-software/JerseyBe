const orderRepository = require('../../repositories/orderRepository');
const bahanBajuRepository = require('../../repositories/bahanBajuRepository');
const userRepository = require('../../repositories/userRepository');
const { calculateAuthoritativeOrderTotal } = require('./orderPricingService');
const {
    normalizeOrderPaymentFields,
    INTERNAL_STAFF_ROLES,
    isInternalStaff,
    assertOrderOwnerOrStaff,
    maskPhoneNumber
} = require('./orderCommon');
const {
    generateRandomId,
    parseSizeAndSleeve
} = require('../../utils/orderUtils');

/**
 * Create a new jersey order with random alphanumeric ID, authoritative price calculation,
 * customer profile resolution, and default payment allocations.
 */
const createOrder = async ({
    customerId,
    customerName,
    customerPhone,
    totalAmount,
    subtotalAmount,
    discount,
    materialId,
    materialName,
    materialPrice,
    bahanBajuId,
    designNote,
    designUrl,
    paymentUrl,
    paymentType,
    paidAmount,
    remainingAmount,
    shippingMethod,
    shippingAddress,
    details,
    callerRole
}) => {
    let orderId = generateRandomId();
    let existing = await orderRepository.checkOrderIdExists(orderId);
    while (existing) {
        orderId = generateRandomId();
        existing = await orderRepository.checkOrderIdExists(orderId);
    }

    const isCustomerCaller = (callerRole || '').toLowerCase() === 'customer';
    const safeDetails = Array.isArray(details) ? details : [];
    const effectiveMaterialId = materialId !== undefined ? materialId : bahanBajuId;
    const pricingCalc = await calculateAuthoritativeOrderTotal(safeDetails, {
        materialId: effectiveMaterialId,
        materialName,
        materialPrice,
        discount
    });

    const computedTotal = pricingCalc.totalAmount;
    const computedSubtotal = pricingCalc.subtotalAmount;
    const resolvedDiscount = pricingCalc.discount;
    const resolvedMaterialPrice = pricingCalc.materialPrice;
    const resolvedMaterialName = pricingCalc.materialName || (safeDetails[0]?.productTitle || null);
    const resolvedMaterialId = pricingCalc.materialId;

    const total = isCustomerCaller && computedTotal > 0
        ? computedTotal
        : (parseFloat(totalAmount) || computedTotal || 0);
    const subtotal = computedSubtotal > 0 ? computedSubtotal : total;

    let resolvedCustomerName = customerName ? String(customerName).trim() : '';
    let resolvedCustomerPhone = customerPhone ? String(customerPhone).replace(/\D/g, '').trim() : '';
    if (customerId) {
        const parsedCustId = parseInt(customerId, 10);
        if (!isNaN(parsedCustId) && parsedCustId > 0) {
            const customerUser = await userRepository.findUserById(parsedCustId, {
                select: { username: true, role: true, customer: { select: { nama: true, phone: true } } }
            });
            if (customerUser && (customerUser.role || '').toLowerCase() === 'customer') {
                if (!resolvedCustomerName) {
                    resolvedCustomerName = customerUser.customer?.nama || customerUser.username || '';
                }
                if (!resolvedCustomerPhone && customerUser.customer?.phone) {
                    resolvedCustomerPhone = String(customerUser.customer.phone).replace(/\D/g, '');
                }
            }
        }
    }

    const pType = paymentType === 'FULL' ? 'FULL' : 'DP';
    let paid = parseFloat(paidAmount);
    if (isNaN(paid) || paid < 0) {
        paid = pType === 'FULL' ? total : 0;
    }
    paid = Math.min(total, paid);
    let remaining = parseFloat(remainingAmount);
    if (isNaN(remaining) || remaining < 0 || isCustomerCaller) {
        remaining = Math.max(0, total - paid);
    }

    let safePaymentUrl = paymentUrl;
    if (isCustomerCaller && (safePaymentUrl === 'LUNAS_ADMIN' || safePaymentUrl === 'DP_TERKONFIRMASI_ADMIN')) {
        safePaymentUrl = 'MENUNGGU_PEMBAYARAN_ADMIN';
    }

    const resolvedPaymentUrl = pType === 'FULL'
        ? (safePaymentUrl && safePaymentUrl !== 'MENUNGGU_PEMBAYARAN_ADMIN' ? safePaymentUrl : (isCustomerCaller ? 'MENUNGGU_PEMBAYARAN_ADMIN' : 'LUNAS_ADMIN'))
        : (paid > 0 && safePaymentUrl === 'MENUNGGU_PEMBAYARAN_ADMIN' && !isCustomerCaller ? 'DP_TERKONFIRMASI_ADMIN' : safePaymentUrl);

    return await orderRepository.createOrder({
        orderId,
        customerId,
        customerName: resolvedCustomerName || null,
        customerPhone: resolvedCustomerPhone || null,
        totalAmount: total,
        subtotalAmount: subtotal,
        discount: resolvedDiscount,
        materialId: resolvedMaterialId,
        materialName: resolvedMaterialName,
        materialPrice: resolvedMaterialPrice,
        paymentType: pType,
        paidAmount: paid,
        remainingAmount: remaining,
        designNote,
        designUrl,
        paymentUrl: resolvedPaymentUrl,
        shippingMethod: shippingMethod || 'PICKUP',
        shippingAddress: shippingMethod === 'COD' ? shippingAddress : null
    }, pricingCalc.detailsWithPrices.map(d => ({
        productId: d.productId ? parseInt(d.productId, 10) : (resolvedMaterialId || null),
        productTitle: d.productTitle || resolvedMaterialName || 'Custom Jersey',
        playerName: d.playerName,
        playerNumber: d.playerNumber,
        playerSize: d.playerSize,
        unitPrice: d.unitPrice || resolvedMaterialPrice,
        statusBaju: d.statusBaju !== undefined ? Boolean(d.statusBaju) : false,
        statusCelana: d.statusCelana !== undefined ? Boolean(d.statusCelana) : false
    })));
};

/**
 * Query orders with multi-field search and filters, resolving customer account names
 * and formatting payment ledger states.
 */
const getAllOrders = async ({ search, status, storageLocationId } = {}) => {
    let matchingUserIds = [];
    if (search && search.trim()) {
        matchingUserIds = await userRepository.findCustomerUserIdsByQuery(search.trim());
    }

    const orders = await orderRepository.findOrdersWithFilters({
        search,
        status,
        storageLocationId,
        matchingUserIds
    });

    const userIds = orders.map(o => o.customerId);
    const users = await userRepository.findUsersByIds(userIds, {
        id: true,
        username: true,
        role: true,
        customer: { select: { nama: true } }
    });

    const userMap = {};
    const userRoleMap = {};
    users.forEach(u => {
        const role = (u.role || '').toLowerCase();
        userRoleMap[u.id] = role;
        if (role === 'customer') {
            userMap[u.id] = u.customer?.nama || u.username;
        }
    });

    return orders.map(o => {
        const isCustomerAccount = userRoleMap[o.customerId] === 'customer';
        const rawTrimmedName = o.customerName ? String(o.customerName).trim() : '';
        const isInternalAccountName = ['admin', 'staff fcsv', 'manager', 'desain', 'gudang'].includes(rawTrimmedName.toLowerCase());
        const trimmedOrderName = isInternalAccountName ? '' : rawTrimmedName;
        const resolvedCustomerName = isCustomerAccount
            ? (trimmedOrderName || userMap[o.customerId] || 'Pelanggan')
            : (trimmedOrderName || '');

        return normalizeOrderPaymentFields({
            ...o,
            isAdminOrder: !isCustomerAccount,
            customerName: resolvedCustomerName,
            designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : 'Belum Ada',
            storageLocation: o.storageLocation || null
        });
    });
};

/**
 * Handle order status transitions, automated Q-XXX queue number assignment,
 * and automated fabric inventory decrement upon approval into DESAIN status.
 */
const updateOrderStatus = async (id, { status, designerId, isWorking, paymentType, paidAmount, remainingAmount }) => {
    const orderIdInt = parseInt(id, 10);
    const currentOrder = await orderRepository.findOrderById(orderIdInt, { details: true });
    if (!currentOrder) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    const total = Number(currentOrder.totalAmount) || 0;
    const dataUpdate = {};
    if (status !== undefined) dataUpdate.status = status;
    if (designerId !== undefined) dataUpdate.designerId = designerId;
    if (isWorking !== undefined) dataUpdate.isWorking = isWorking;

    if (paymentType !== undefined) {
        dataUpdate.paymentType = paymentType === 'FULL' ? 'FULL' : 'DP';
    }
    if (paidAmount !== undefined) {
        const parsedPaid = Math.min(total, Math.max(0, parseFloat(paidAmount) || 0));
        dataUpdate.paidAmount = parsedPaid;
        dataUpdate.remainingAmount = remainingAmount !== undefined
            ? Math.max(0, parseFloat(remainingAmount) || 0)
            : Math.max(0, total - parsedPaid);
    }

    if (status === 'DESAIN') {
        if (dataUpdate.paidAmount !== undefined) {
            if (currentOrder.paymentUrl === 'MENUNGGU_PEMBAYARAN_ADMIN') {
                dataUpdate.paymentUrl = dataUpdate.paidAmount >= total
                    ? 'LUNAS_ADMIN'
                    : (dataUpdate.paidAmount > 0 ? 'DP_TERKONFIRMASI_ADMIN' : 'MENUNGGU_PEMBAYARAN_ADMIN');
            }
        }
    } else if (status === 'SELESAI') {
        dataUpdate.paidAmount = total;
        dataUpdate.remainingAmount = 0;
        if (currentOrder.paymentUrl === 'MENUNGGU_PEMBAYARAN_ADMIN' || currentOrder.paymentUrl === 'DP_TERKONFIRMASI_ADMIN') {
            dataUpdate.paymentUrl = 'LUNAS_ADMIN';
        }
    }

    return await orderRepository.runTransaction(async (tx) => {
        if (status === 'DESAIN' && !currentOrder.queueNumber) {
            const lastOrder = await orderRepository.findLastOrderWithQueue(tx);
            let nextNum = 1;
            if (lastOrder && lastOrder.queueNumber) {
                const match = lastOrder.queueNumber.match(/Q-(\d+)/);
                if (match) {
                    nextNum = parseInt(match[1], 10) + 1;
                }
            }
            dataUpdate.queueNumber = `Q-${String(nextNum).padStart(3, '0')}`;
        }

        const updated = await orderRepository.updateOrder(orderIdInt, dataUpdate, null, tx);

        if (currentOrder.status === 'MENUNGGU' && status === 'DESAIN') {
            const stockToReduce = {};
            const uniqueProductIds = [...new Set(currentOrder.details.map(d => parseInt(d.productId, 10)))].filter(Boolean);
            const dbBahans = await bahanBajuRepository.findBahanByIds(uniqueProductIds, tx);
            const bahanMap = {};
            dbBahans.forEach(b => {
                bahanMap[b.id] = b;
            });

            currentOrder.details.forEach(detail => {
                const { size, sleeve } = parseSizeAndSleeve(detail.playerSize);
                const bId = parseInt(detail.productId, 10);
                if (!bId || isNaN(bId) || !bahanMap[bId]) return;

                const rasio = bahanMap[bId]?.rasioKonversi || 2.5;
                const s = size.toUpperCase().trim();
                const isLongSleeve = sleeve === 'Lengan Panjang';
                const isBigSize = ['3XL', '4XL', '5XL', '6XL', 'XXXL', 'XXXXL'].includes(s);

                let meterReq = 0;
                if (isLongSleeve) {
                    meterReq = isBigSize ? 2.5 : 1.25;
                } else {
                    meterReq = isBigSize ? 1.25 : 0.8333;
                }

                const kgReq = meterReq / rasio;
                stockToReduce[bId] = (stockToReduce[bId] || 0) + kgReq;
            });

            for (const [productId, kgToDecrement] of Object.entries(stockToReduce)) {
                const idInt = parseInt(productId, 10);
                const bahan = bahanMap[idInt];

                if (bahan) {
                    const newKuantitas = Math.max(0, bahan.kuantitasKg - kgToDecrement);
                    const newStatus = newKuantitas <= 0 ? 'Habis' : bahan.status;

                    await bahanBajuRepository.updateBahan(idInt, {
                        kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                        status: newStatus
                    }, tx);

                    await bahanBajuRepository.createHistory({
                        bahanId: idInt,
                        namaBahan: bahan.nama,
                        aksi: 'KURANG',
                        jumlah: parseFloat(kgToDecrement.toFixed(4)),
                        stokAkhir: parseFloat(newKuantitas.toFixed(4)),
                        keterangan: `Ketersediaan berkurang otomatis (Order ${currentOrder.orderId} diterima)`
                    }, tx);
                }
            }
        }

        return updated;
    });
};

/**
 * Retrieve orders for a specific customer with customer display names resolved.
 */
const getOrdersByCustomer = async (customerId) => {
    const cId = parseInt(customerId, 10);
    const orders = await orderRepository.findOrdersByCustomerId(cId, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    }, { createdAt: 'desc' });

    const user = await userRepository.findUserById(cId, {
        select: {
            username: true,
            customer: { select: { nama: true } }
        }
    });

    return orders.map(o => normalizeOrderPaymentFields({
        ...o,
        customerName: o.customerName || (user ? (user.customer?.nama || user.username) : 'Guest User'),
        designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : 'Belum Ada'
    }));
};

/**
 * Retrieve orders assigned to a specific designer with customer display names resolved.
 */
const getOrdersByDesigner = async (designerId) => {
    const dId = parseInt(designerId, 10);
    const orders = await orderRepository.findOrdersByDesignerId(dId, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    }, { createdAt: 'desc' });

    const userIds = orders.map(o => o.customerId);
    const users = await userRepository.findUsersByIds(userIds, {
        id: true,
        username: true,
        customer: { select: { nama: true } }
    });

    const userMap = {};
    users.forEach(u => {
        userMap[u.id] = u.customer?.nama || u.username;
    });

    return orders.map(o => normalizeOrderPaymentFields({
        ...o,
        customerName: o.customerName || userMap[o.customerId] || 'Guest User',
        designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : 'Belum Ada'
    }));
};

/**
 * Public or authenticated order tracking:
 * Resolves order details and masks sensitive customer data for unauthenticated or non-owner callers.
 */
const trackOrder = async (orderId, callerUser = null) => {
    const order = await orderRepository.findOrderByOrderIdCaseInsensitive(orderId, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    });

    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    const user = await userRepository.findUserById(order.customerId, {
        select: {
            username: true,
            customer: { select: { nama: true } }
        }
    });

    const normalized = normalizeOrderPaymentFields({
        ...order,
        customerName: order.customerName || (user ? (user.customer?.nama || user.username) : 'Guest User'),
        designerName: order.designer ? (order.designer.staff?.nama || order.designer.username) : 'Belum Ada'
    });

    const isOwnerOrStaff = Boolean(
        callerUser && (isInternalStaff(callerUser) || callerUser.id === order.customerId)
    );

    if (isOwnerOrStaff) {
        return normalized;
    }

    return {
        ...normalized,
        customerPhone: maskPhoneNumber(normalized.customerPhone),
        shippingAddress: normalized.shippingAddress ? 'Alamat Terlindungi' : null,
        paymentUrl: normalized.paymentUrl && normalized.paymentUrl !== 'MENUNGGU_PEMBAYARAN_ADMIN'
            ? 'TERVERIFIKASI'
            : normalized.paymentUrl
    };
};

/**
 * Update order details (only allowed in MENUNGGU status):
 * Recalculates authoritative totals and replaces jersey player detail items atomically.
 */
const updateOrder = async (id, {
    totalAmount,
    subtotalAmount,
    discount,
    materialId,
    materialName,
    materialPrice,
    designNote,
    designUrl,
    paymentUrl,
    shippingMethod,
    shippingAddress,
    details
}, callerUser = null) => {
    const orderIdInt = parseInt(id, 10);
    const currentOrder = await assertOrderOwnerOrStaff(orderIdInt, callerUser);

    if (currentOrder.status !== 'MENUNGGU') {
        const error = new Error('Pesanan yang sudah di-acc tidak dapat diedit.');
        error.statusCode = 400;
        throw error;
    }

    const isCustomerCaller = (callerUser?.role || '').toLowerCase() === 'customer';
    const effectiveMaterialId = materialId !== undefined ? materialId : currentOrder.materialId;
    const effectiveMaterialName = materialName !== undefined ? materialName : currentOrder.materialName;
    const effectiveMaterialPrice = materialPrice !== undefined ? materialPrice : currentOrder.materialPrice;
    const effectiveDiscount = discount !== undefined ? discount : currentOrder.discount;

    const safeDetails = Array.isArray(details) ? details : [];
    const pricingCalc = await calculateAuthoritativeOrderTotal(safeDetails, {
        materialId: effectiveMaterialId,
        materialName: effectiveMaterialName,
        materialPrice: effectiveMaterialPrice,
        discount: effectiveDiscount
    });

    const computedTotal = pricingCalc.totalAmount;
    const computedSubtotal = pricingCalc.subtotalAmount;
    const resolvedDiscount = pricingCalc.discount;
    const resolvedMaterialPrice = pricingCalc.materialPrice;
    const resolvedMaterialName = pricingCalc.materialName || effectiveMaterialName || (safeDetails[0]?.productTitle || null);
    const resolvedMaterialId = pricingCalc.materialId;

    const resolvedTotal = isCustomerCaller && computedTotal > 0
        ? computedTotal
        : (parseFloat(totalAmount) || computedTotal || currentOrder.totalAmount);
    const finalSubtotal = computedSubtotal > 0 ? computedSubtotal : (subtotalAmount || resolvedTotal);

    let safePaymentUrl = paymentUrl;
    if (isCustomerCaller && (safePaymentUrl === 'LUNAS_ADMIN' || safePaymentUrl === 'DP_TERKONFIRMASI_ADMIN')) {
        safePaymentUrl = currentOrder.paymentUrl;
    }

    return await orderRepository.runTransaction(async (tx) => {
        await orderRepository.deleteOrderDetailsByOrderId(orderIdInt, tx);

        return await orderRepository.updateOrder(orderIdInt, {
            totalAmount: resolvedTotal,
            subtotalAmount: finalSubtotal,
            discount: resolvedDiscount,
            materialId: resolvedMaterialId,
            materialName: resolvedMaterialName,
            materialPrice: resolvedMaterialPrice,
            designNote,
            designUrl,
            paymentUrl: safePaymentUrl,
            shippingMethod: shippingMethod !== undefined ? shippingMethod : currentOrder.shippingMethod,
            shippingAddress: shippingMethod !== undefined ? (shippingMethod === 'COD' ? shippingAddress : null) : currentOrder.shippingAddress,
            details: {
                create: pricingCalc.detailsWithPrices.map(d => ({
                    productId: d.productId ? parseInt(d.productId, 10) : (resolvedMaterialId || null),
                    productTitle: d.productTitle || resolvedMaterialName || 'Custom Jersey',
                    playerName: d.playerName,
                    playerNumber: d.playerNumber,
                    playerSize: d.playerSize,
                    unitPrice: d.unitPrice || resolvedMaterialPrice,
                    statusBaju: d.statusBaju !== undefined ? Boolean(d.statusBaju) : false,
                    statusCelana: d.statusCelana !== undefined ? Boolean(d.statusCelana) : false
                }))
            }
        }, {
            details: true
        }, tx);
    });
};

/**
 * Assign or unassign a storage location to an order.
 */
const assignOrderStorageLocation = async (id, storageLocationId) => {
    const storageLocationService = require('../storageLocationService');
    return await storageLocationService.assignOrderLocation(id, storageLocationId);
};

module.exports = {
    assertOrderOwnerOrStaff,
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getOrdersByCustomer,
    getOrdersByDesigner,
    trackOrder,
    updateOrder,
    assignOrderStorageLocation
};
