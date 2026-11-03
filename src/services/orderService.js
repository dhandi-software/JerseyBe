const prisma = require('../config/prisma');
const orderRepository = require('../repositories/orderRepository');
const bahanBajuRepository = require('../repositories/bahanBajuRepository');
const {
    generateRandomId,
    parseSizeAndSleeve,
    getSizeSurcharge
} = require('../utils/orderUtils');

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

const calculateAuthoritativeOrderTotal = async (details = []) => {
    if (!Array.isArray(details) || details.length === 0) return 0;

    const uniqueProductIds = [...new Set(
        details.map(d => parseInt(d.productId, 10)).filter(id => !isNaN(id) && id > 0)
    )];

    const dbBahans = uniqueProductIds.length > 0
        ? await prisma.bahanBaju.findMany({ where: { id: { in: uniqueProductIds } } })
        : [];

    const bahanPriceMap = {};
    dbBahans.forEach(b => {
        bahanPriceMap[b.id] = Number(b.harga) || 150000;
    });

    return details.reduce((sum, detail) => {
        const pId = parseInt(detail.productId, 10);
        const basePrice = bahanPriceMap[pId] || 150000;
        const { size } = parseSizeAndSleeve(detail.playerSize || 'L');
        return sum + basePrice + getSizeSurcharge(size);
    }, 0);
};

const createOrder = async ({
    customerId,
    customerName,
    customerPhone,
    totalAmount,
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
    let existing = await prisma.jerseyOrder.findUnique({ where: { orderId } });
    while (existing) {
        orderId = generateRandomId();
        existing = await prisma.jerseyOrder.findUnique({ where: { orderId } });
    }

    const isCustomerCaller = (callerRole || '').toLowerCase() === 'customer';
    const safeDetails = Array.isArray(details) ? details : [];
    const computedTotal = await calculateAuthoritativeOrderTotal(safeDetails);
    const total = isCustomerCaller && computedTotal > 0
        ? computedTotal
        : (parseFloat(totalAmount) || computedTotal || 0);

    let resolvedCustomerName = customerName ? String(customerName).trim() : '';
    let resolvedCustomerPhone = customerPhone ? String(customerPhone).replace(/\D/g, '').trim() : '';
    if (customerId) {
        const parsedCustId = parseInt(customerId, 10);
        if (!isNaN(parsedCustId) && parsedCustId > 0) {
            const customerUser = await prisma.user.findUnique({
                where: { id: parsedCustId },
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
        paymentType: pType,
        paidAmount: paid,
        remainingAmount: remaining,
        designNote,
        designUrl,
        paymentUrl: resolvedPaymentUrl,
        shippingMethod: shippingMethod || 'PICKUP',
        shippingAddress: shippingMethod === 'COD' ? shippingAddress : null
    }, safeDetails.map(d => ({
        productId: d.productId,
        productTitle: d.productTitle,
        playerName: d.playerName,
        playerNumber: d.playerNumber,
        playerSize: d.playerSize,
        statusBaju: d.statusBaju !== undefined ? Boolean(d.statusBaju) : false,
        statusCelana: d.statusCelana !== undefined ? Boolean(d.statusCelana) : false
    })));
};

const getAllOrders = async ({ search, status } = {}) => {
    const where = {};

    if (status && status !== 'ALL' && status !== 'SEMUA') {
        if (status === 'MENUNGGU') {
            where.status = { in: ['MENUNGGU', 'MENUNGGU VERIFIKASI'] };
        } else {
            where.status = status;
        }
    }

    if (search && search.trim()) {
        const queryText = search.trim();

        // Match user account names or usernames for registered customer orders
        const matchedUsers = await prisma.user.findMany({
            where: {
                OR: [
                    { username: { contains: queryText, mode: 'insensitive' } },
                    { customer: { nama: { contains: queryText, mode: 'insensitive' } } }
                ]
            },
            select: { id: true }
        });
        const matchingUserIds = matchedUsers.map(u => u.id);

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
            }
        ];
    }

    const orders = await orderRepository.findOrders(where, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    }, {
        createdAt: 'desc'
    });

    const userIds = orders.map(o => o.customerId);
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            username: true,
            role: true,
            customer: { select: { nama: true } }
        }
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
            designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : 'Belum Ada'
        });
    });
};

const updateOrderStatus = async (id, { status, designerId, isWorking, paymentType, paidAmount, remainingAmount }) => {
    const orderIdInt = parseInt(id);
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

    return await prisma.$transaction(async (tx) => {
        if (status === 'DESAIN' && !currentOrder.queueNumber) {
            const lastOrder = await tx.jerseyOrder.findFirst({
                where: { queueNumber: { not: null } },
                orderBy: { id: 'desc' }
            });
            let nextNum = 1;
            if (lastOrder && lastOrder.queueNumber) {
                const match = lastOrder.queueNumber.match(/Q-(\d+)/);
                if (match) {
                    nextNum = parseInt(match[1], 10) + 1;
                }
            }
            dataUpdate.queueNumber = `Q-${String(nextNum).padStart(3, '0')}`;
        }

        const updated = await tx.jerseyOrder.update({
            where: { id: orderIdInt },
            data: dataUpdate
        });

        if (currentOrder.status === 'MENUNGGU' && status === 'DESAIN') {
            const stockToReduce = {};
            const uniqueProductIds = [...new Set(currentOrder.details.map(d => parseInt(d.productId)))].filter(Boolean);
            const dbBahans = await tx.bahanBaju.findMany({
                where: { id: { in: uniqueProductIds } }
            });
            const bahanMap = {};
            dbBahans.forEach(b => {
                bahanMap[b.id] = b;
            });

            currentOrder.details.forEach(detail => {
                const { size, sleeve } = parseSizeAndSleeve(detail.playerSize);
                const bId = parseInt(detail.productId);
                if (!bId) return;

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
                const idInt = parseInt(productId);
                const bahan = bahanMap[idInt];

                if (bahan) {
                    const newKuantitas = Math.max(0, bahan.kuantitasKg - kgToDecrement);
                    const newStatus = newKuantitas <= 0 ? 'Habis' : bahan.status;

                    await tx.bahanBaju.update({
                        where: { id: idInt },
                        data: {
                            kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                            status: newStatus
                        }
                    });

                    await tx.bahanBajuHistory.create({
                        data: {
                            bahanId: idInt,
                            namaBahan: bahan.nama,
                            aksi: 'KURANG',
                            jumlah: parseFloat(kgToDecrement.toFixed(4)),
                            stokAkhir: parseFloat(newKuantitas.toFixed(4)),
                            keterangan: `Ketersediaan berkurang otomatis (Order ${currentOrder.orderId} diterima)`
                        }
                    });
                }
            }
        }

        return updated;
    });
};

const getOrdersByCustomer = async (customerId) => {
    const cId = parseInt(customerId);
    const orders = await orderRepository.findOrders({ customerId: cId }, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    }, { createdAt: 'desc' });

    const user = await prisma.user.findUnique({
        where: { id: cId },
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

const getOrdersByDesigner = async (designerId) => {
    const dId = parseInt(designerId);
    const orders = await orderRepository.findOrders({ designerId: dId }, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    }, { createdAt: 'desc' });

    const userIds = orders.map(o => o.customerId);
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            username: true,
            customer: { select: { nama: true } }
        }
    });

    const userMap = {};
    users.forEach(u => userMap[u.id] = u.customer?.nama || u.username);

    return orders.map(o => normalizeOrderPaymentFields({
        ...o,
        customerName: o.customerName || userMap[o.customerId] || 'Guest User',
        designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : 'Belum Ada'
    }));
};

const maskPhoneNumber = (phone) => {
    if (!phone || typeof phone !== 'string') return null;
    const trimmed = phone.trim();
    if (trimmed.length <= 6) return '***';
    return `${trimmed.slice(0, 4)}****${trimmed.slice(-2)}`;
};

const trackOrder = async (orderId, callerUser = null) => {
    const order = await prisma.jerseyOrder.findFirst({
        where: {
            orderId: {
                equals: orderId,
                mode: 'insensitive'
            }
        },
        include: {
            details: true,
            designer: { select: { staff: { select: { nama: true } }, username: true } }
        }
    });

    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    const user = await prisma.user.findUnique({
        where: { id: order.customerId },
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

const updateOrder = async (id, { totalAmount, designNote, designUrl, paymentUrl, shippingMethod, shippingAddress, details }, callerUser = null) => {
    const orderIdInt = parseInt(id);
    const currentOrder = await assertOrderOwnerOrStaff(orderIdInt, callerUser);

    if (currentOrder.status !== 'MENUNGGU') {
        const error = new Error('Pesanan yang sudah di-acc tidak dapat diedit.');
        error.statusCode = 400;
        throw error;
    }

    const isCustomerCaller = (callerUser?.role || '').toLowerCase() === 'customer';
    const computedTotal = await calculateAuthoritativeOrderTotal(details);
    const resolvedTotal = isCustomerCaller && computedTotal > 0
        ? computedTotal
        : (parseFloat(totalAmount) || computedTotal || currentOrder.totalAmount);

    let safePaymentUrl = paymentUrl;
    if (isCustomerCaller && (safePaymentUrl === 'LUNAS_ADMIN' || safePaymentUrl === 'DP_TERKONFIRMASI_ADMIN')) {
        safePaymentUrl = currentOrder.paymentUrl;
    }

    return await prisma.$transaction(async (tx) => {
        await tx.jerseyOrderDetail.deleteMany({
            where: { orderId: orderIdInt }
        });

        return await tx.jerseyOrder.update({
            where: { id: orderIdInt },
            data: {
                totalAmount: resolvedTotal,
                designNote,
                designUrl,
                paymentUrl: safePaymentUrl,
                shippingMethod: shippingMethod !== undefined ? shippingMethod : currentOrder.shippingMethod,
                shippingAddress: shippingMethod !== undefined ? (shippingMethod === 'COD' ? shippingAddress : null) : currentOrder.shippingAddress,
                details: {
                    create: details.map(d => ({
                        productId: d.productId,
                        productTitle: d.productTitle,
                        playerName: d.playerName,
                        playerNumber: d.playerNumber,
                        playerSize: d.playerSize,
                        statusBaju: d.statusBaju !== undefined ? Boolean(d.statusBaju) : false,
                        statusCelana: d.statusCelana !== undefined ? Boolean(d.statusCelana) : false
                    }))
                }
            },
            include: {
                details: true
            }
        });
    });
};

const uploadMockup = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const mockupUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, {
        mockupUrl,
        designStatus: 'SENT'
    });
};

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

const approveDesign = async (id) => {
    return await orderRepository.updateOrder(id, {
        designStatus: 'APPROVED',
        designFeedback: null
    });
};

const unapproveDesign = async (id) => {
    const order = await orderRepository.findOrderById(id);
    if (!order || (order.status !== 'DESAIN' && order.status !== 'LAYOUT')) {
        const error = new Error('Cannot unapprove design at this stage');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        designStatus: 'SENT'
    });
};

const revisiDesign = async (id, feedback) => {
    if (!feedback) {
        const error = new Error('Feedback is required for revision');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        designStatus: 'REVISI',
        designFeedback: feedback
    });
};

const cancelMockup = async (id) => {
    return await orderRepository.updateOrder(id, {
        mockupUrl: null,
        designStatus: 'PENDING'
    });
};

const uploadLayout = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const layoutUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, {
        layoutUrl,
        layoutStatus: 'SENT'
    });
};

const approveLayout = async (id) => {
    return await orderRepository.updateOrder(id, {
        layoutStatus: 'APPROVED',
        layoutFeedback: null
    });
};

const unapproveLayout = async (id) => {
    const order = await orderRepository.findOrderById(id);
    if (!order || order.status !== 'LAYOUT') {
        const error = new Error('Cannot unapprove layout at this stage');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        layoutStatus: 'SENT'
    });
};

const revisiLayout = async (id, feedback) => {
    if (!feedback) {
        const error = new Error('Feedback is required for revision');
        error.statusCode = 400;
        throw error;
    }

    return await orderRepository.updateOrder(id, {
        layoutStatus: 'REVISI',
        layoutFeedback: feedback
    });
};

const cancelLayout = async (id) => {
    return await orderRepository.updateOrder(id, {
        layoutUrl: null,
        layoutStatus: 'PENDING'
    });
};

const uploadPrint = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const printUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, { printUrl });
};

const uploadFinishing = async (id, file) => {
    if (!file) {
        const error = new Error('No file uploaded');
        error.statusCode = 400;
        throw error;
    }

    const finishingUrl = `/uploads/${file.filename}`;
    return await orderRepository.updateOrder(id, { finishingUrl });
};

const recommendAlternatives = async (id, recommendedBahanIds) => {
    return await orderRepository.updateOrder(id, {
        recommendedBahanIds: recommendedBahanIds || []
    });
};

const selectAlternative = async (id, selectedBahanId) => {
    const orderIdInt = parseInt(id);
    const order = await orderRepository.findOrderById(orderIdInt, { details: true });
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    const selectedBahan = await bahanBajuRepository.findBahanById(selectedBahanId);
    if (!selectedBahan) {
        const error = new Error('Selected material not found');
        error.statusCode = 404;
        throw error;
    }

    return await prisma.$transaction(async (tx) => {
        await tx.jerseyOrderDetail.updateMany({
            where: { orderId: orderIdInt },
            data: {
                productId: selectedBahan.id,
                productTitle: selectedBahan.nama
            }
        });

        const basePrice = selectedBahan.harga || 150000;
        let newTotal = 0;
        order.details.forEach(detail => {
            let size = 'L';
            if (detail.playerSize) {
                const match = detail.playerSize.match(/^([^(]+)/);
                if (match) {
                    size = match[1].trim();
                }
            }
            const surcharge = getSizeSurcharge(size);
            newTotal += basePrice + surcharge;
        });

        return await tx.jerseyOrder.update({
            where: { id: orderIdInt },
            data: {
                recommendedBahanIds: [],
                totalAmount: newTotal
            },
            include: {
                details: true
            }
        });
    });
};

const recordDamage = async (id, { productId, pcs, keterangan, actor }) => {
    const orderIdInt = parseInt(id);
    if (!productId || !pcs || pcs <= 0) {
        const error = new Error('Product ID and valid Pcs are required');
        error.statusCode = 400;
        throw error;
    }

    const order = await orderRepository.findOrderById(orderIdInt, { details: true });
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    const user = await prisma.user.findUnique({
        where: { id: order.customerId },
        select: { username: true, customer: { select: { nama: true } } }
    });
    const customerName = order.customerName || user?.customer?.nama || user?.username || 'Customer';

    const bahan = await bahanBajuRepository.findBahanById(productId);
    if (!bahan) {
        const error = new Error('Material not found');
        error.statusCode = 404;
        throw error;
    }

    const rasio = bahan.rasioKonversi || 2.5;
    const kgToDecrement = parseFloat((pcs / rasio).toFixed(4));

    return await prisma.$transaction(async (tx) => {
        const newKuantitas = Math.max(0, bahan.kuantitasKg - kgToDecrement);
        const newStatus = newKuantitas <= 0 ? 'Habis' : bahan.status;

        await tx.bahanBaju.update({
            where: { id: bahan.id },
            data: {
                kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                status: newStatus
            }
        });

        await tx.bahanBajuHistory.create({
            data: {
                bahanId: bahan.id,
                namaBahan: bahan.nama,
                aksi: 'RUSAK',
                jumlah: kgToDecrement,
                stokAkhir: parseFloat(newKuantitas.toFixed(4)),
                keterangan: keterangan ? `Kerusakan menjahit - ${keterangan}` : 'Kerusakan menjahit',
                actor: actor || 'System/Admin',
                customerName,
                pcs: parseInt(pcs),
                orderId: orderIdInt
            }
        });

        return await tx.jerseyOrder.update({
            where: { id: orderIdInt },
            data: {
                damagedPcs: (order.damagedPcs || 0) + parseInt(pcs)
            },
            include: {
                details: true
            }
        });
    });
};

const updateDamage = async (historyId, { pcs, keterangan, actor }) => {
    if (!pcs || pcs <= 0) {
        const error = new Error('Valid Pcs is required');
        error.statusCode = 400;
        throw error;
    }

    const history = await prisma.bahanBajuHistory.findUnique({
        where: { id: parseInt(historyId) },
        include: { bahan: true }
    });

    if (!history || history.aksi !== 'RUSAK' || !history.orderId) {
        const error = new Error('Damage history not found or invalid');
        error.statusCode = 404;
        throw error;
    }

    const bahan = history.bahan;
    if (!bahan) {
        const error = new Error('Associated material not found');
        error.statusCode = 404;
        throw error;
    }

    const oldPcs = history.pcs || 0;
    const newPcs = parseInt(pcs);
    const diffPcs = newPcs - oldPcs;

    const rasio = bahan.rasioKonversi || 2.5;
    const oldKg = history.jumlah;
    const newKg = parseFloat((newPcs / rasio).toFixed(4));
    const diffKg = newKg - oldKg;

    return await prisma.$transaction(async (tx) => {
        const currentKuantitas = bahan.kuantitasKg;
        const newKuantitas = Math.max(0, currentKuantitas - diffKg);
        const newStatus = newKuantitas <= 0 ? 'Habis' : 'Tersedia';

        await tx.bahanBaju.update({
            where: { id: bahan.id },
            data: {
                kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                status: newStatus
            }
        });

        const newKeteranganText = keterangan ? `Kerusakan menjahit - ${keterangan}` : 'Kerusakan menjahit';

        const updatedHistory = await tx.bahanBajuHistory.update({
            where: { id: parseInt(historyId) },
            data: {
                pcs: newPcs,
                jumlah: newKg,
                keterangan: newKeteranganText,
                stokAkhir: parseFloat(newKuantitas.toFixed(4)),
                actor: actor || history.actor
            }
        });

        const order = await tx.jerseyOrder.findUnique({
            where: { id: history.orderId }
        });

        if (order) {
            await tx.jerseyOrder.update({
                where: { id: order.id },
                data: {
                    damagedPcs: Math.max(0, (order.damagedPcs || 0) + diffPcs)
                }
            });
        }

        return updatedHistory;
    });
};

const getDamageHistory = async (id) => {
    return await prisma.bahanBajuHistory.findMany({
        where: { orderId: parseInt(id), aksi: 'RUSAK' },
        orderBy: { createdAt: 'desc' }
    });
};

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

const addOrderDetail = async (orderId, { playerName, playerNumber, playerSize, statusBaju, statusCelana }) => {
    const orderIdInt = parseInt(orderId);
    const order = await orderRepository.findOrderById(orderIdInt);
    if (!order) {
        const error = new Error('Pesanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const firstDetail = order.details?.[0];
    const productId = firstDetail?.productId || 1;
    const productTitle = firstDetail?.productTitle || 'Custom Jersey';

    // Calculate unit price from existing order details or product
    let unitPrice = 150000;
    if (order.totalAmount > 0 && order.details && order.details.length > 0) {
        unitPrice = Math.round(order.totalAmount / order.details.length);
    } else if (productId) {
        const bahan = await bahanBajuRepository.findBahanById(productId);
        if (bahan?.harga) unitPrice = bahan.harga;
    }

    const newDetail = await orderRepository.createOrderDetail({
        orderId: orderIdInt,
        productId,
        productTitle,
        playerName: (playerName || 'Pemain Baru').trim(),
        playerNumber: playerNumber ? String(playerNumber).trim() : '',
        playerSize: (playerSize || 'M (Lengan Pendek)').trim(),
        statusBaju: Boolean(statusBaju),
        statusCelana: Boolean(statusCelana)
    });

    const newTotalAmount = (order.totalAmount || 0) + unitPrice;
    const updateData = { totalAmount: newTotalAmount };
    if (order.paymentType === 'DP') {
        updateData.remainingAmount = Math.max(0, newTotalAmount - (order.paidAmount || 0));
    }
    await orderRepository.updateOrder(orderIdInt, updateData);

    return {
        ...newDetail,
        unitPrice,
        newTotalAmount,
        remainingAmount: updateData.remainingAmount
    };
};

const deleteOrderDetail = async (detailId) => {
    const detail = await orderRepository.findOrderDetailById(detailId);
    if (!detail) {
        const error = new Error('Detail anggota tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const order = await orderRepository.findOrderById(detail.orderId);
    let newTotalAmount = 0;
    let newRemainingAmount = undefined;
    if (order) {
        const totalCount = order.details ? order.details.length : 1;
        const unitPrice = totalCount > 0 ? Math.round(order.totalAmount / totalCount) : 0;
        newTotalAmount = Math.max(0, (order.totalAmount || 0) - unitPrice);
        const updateData = { totalAmount: newTotalAmount };
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
        remainingAmount: newRemainingAmount
    };
};

const updateVideoNotes = async (id, { videoUrl, adminNote, designNote }) => {
    const orderIdInt = parseInt(id);
    const order = await orderRepository.findOrderById(orderIdInt);
    if (!order) {
        const error = new Error('Pesanan tidak ditemukan');
        error.statusCode = 404;
        throw error;
    }

    const dataToUpdate = {};
    if (videoUrl !== undefined) dataToUpdate.videoUrl = videoUrl ? videoUrl.trim() : null;
    if (adminNote !== undefined) dataToUpdate.adminNote = adminNote ? adminNote.trim() : null;
    if (designNote !== undefined) dataToUpdate.designNote = designNote ? designNote.trim() : null;

    return await orderRepository.updateOrder(orderIdInt, dataToUpdate, {
        details: true,
        designer: { select: { staff: { select: { nama: true } }, username: true } }
    });
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
    uploadMockup,
    updatePayment,
    approveDesign,
    unapproveDesign,
    revisiDesign,
    cancelMockup,
    uploadLayout,
    approveLayout,
    unapproveLayout,
    revisiLayout,
    cancelLayout,
    uploadPrint,
    uploadFinishing,
    recommendAlternatives,
    selectAlternative,
    recordDamage,
    updateDamage,
    getDamageHistory,
    updateDetailStatus,
    updateOrderDetail,
    addOrderDetail,
    deleteOrderDetail,
    updateVideoNotes
};
