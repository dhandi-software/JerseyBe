const prisma = require('../config/prisma');

const toLocalDateKey = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getOrderRecognizedRevenue = (order) => {
    if (!order || order.status === 'DITOLAK') return 0;
    const total = Number(order.totalAmount) || 0;
    if (total <= 0) return 0;

    if (order.status === 'SELESAI') {
        return total;
    }

    if (order.paymentUrl === 'MENUNGGU_PEMBAYARAN_ADMIN') {
        return 0;
    }

    const paid = Number(order.paidAmount) || 0;
    return Math.min(total, Math.max(0, paid));
};

const getDashboardStats = async ({ year, month }) => {
    const now = new Date();
    const filterYear = year ? parseInt(year) : null;
    const filterMonth = month ? parseInt(month) : null;

    const [totalStaff, totalAdmin] = await Promise.all([
        prisma.user.count({ where: { role: { in: ['desain', 'gudang', 'manager'] } } }),
        prisma.user.count({ where: { role: 'admin' } })
    ]);

    const rawOrders = await prisma.jerseyOrder.findMany({
        where: {
            status: { not: 'DITOLAK' },
            NOT: {
                orderId: { startsWith: 'SEED-' }
            }
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            customerId: true,
            customerName: true,
            status: true,
            paymentType: true,
            paymentUrl: true,
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            createdAt: true,
            details: { select: { id: true, productTitle: true } }
        }
    });

    const orderUserIds = [...new Set(rawOrders.map(o => o.customerId).filter(Boolean))];
    const orderUsers = orderUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: orderUserIds } },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                customer: { select: { id: true, nama: true, category: true } }
            }
        })
        : [];
    const orderUserMap = new Map(orderUsers.map(u => [u.id, u]));

    const INVALID_NAMES = new Set(['', 'ADMIN', 'STAFF FCSV', 'MANAGER', 'DESAIN', 'GUDANG', 'GUEST USER', 'PELANGGAN', 'TANPA NAMA']);
    const isValidCustomerName = (name) => {
        if (!name || typeof name !== 'string') return false;
        return !INVALID_NAMES.has(name.trim().toUpperCase());
    };

    const enrichedOrders = rawOrders.map(order => {
        const u = orderUserMap.get(order.customerId);
        const isCustomerAccount = (u?.role || '').toLowerCase() === 'customer';
        const trimmedOrderName = (order.customerName || '').trim();
        const resolvedCustomerName = isCustomerAccount
            ? (trimmedOrderName || u?.customer?.nama || u?.username || '')
            : (isValidCustomerName(trimmedOrderName) ? trimmedOrderName : '');
        return {
            ...order,
            isAdminOrder: !isCustomerAccount,
            resolvedCustomerName,
            customerAccountUser: isCustomerAccount ? u : null,
            recognizedRevenue: getOrderRecognizedRevenue(order)
        };
    });

    const accOrders = enrichedOrders.filter(order => order.recognizedRevenue > 0);

    const totalRevenue = accOrders.reduce((sum, order) => sum + order.recognizedRevenue, 0);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    const dailySales = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = toLocalDateKey(d);
        const name = `${d.getDate()} ${monthNames[d.getMonth()]}`;
        dailySales.push({ name, pv: 0, dateStr });
    }

    const monthlySales = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const name = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
        monthlySales.push({ name, pv: 0, monthKey: `${d.getFullYear()}-${d.getMonth()}` });
    }

    const yearlySales = [];
    const currentYear = now.getFullYear();
    const startYear = 2022;
    for (let y = startYear; y <= currentYear; y++) {
        yearlySales.push({ name: `${y}`, pv: 0, year: y });
    }

    const lifetimeSales = [];
    let tempYear = startYear;
    let tempMonth = 0;
    const currentMonth = now.getMonth();
    while (tempYear < currentYear || (tempYear === currentYear && tempMonth <= currentMonth)) {
        const name = `${monthNames[tempMonth]} ${tempYear.toString().substring(2)}`;
        lifetimeSales.push({
            name,
            pv: 0,
            monthKey: `${tempYear}-${tempMonth}`
        });
        tempMonth++;
        if (tempMonth > 11) {
            tempMonth = 0;
            tempYear++;
        }
    }

    accOrders.forEach(order => {
        const date = new Date(order.createdAt);
        const dateStr = toLocalDateKey(date);
        const orderYear = date.getFullYear();
        const orderMonth = date.getMonth();
        const monthKey = `${orderYear}-${orderMonth}`;
        const revenue = order.recognizedRevenue;

        const dayObj = dailySales.find(d => d.dateStr === dateStr);
        if (dayObj) dayObj.pv += revenue;

        const monthObj = monthlySales.find(m => m.monthKey === monthKey);
        if (monthObj) monthObj.pv += revenue;

        const yearObj = yearlySales.find(y => y.year === orderYear);
        if (yearObj) yearObj.pv += revenue;

        const lifetimeObj = lifetimeSales.find(l => l.monthKey === monthKey);
        if (lifetimeObj) lifetimeObj.pv += revenue;
    });

    let bestMonth = { month: 'Belum ada', year: '-', pv: 0 };
    lifetimeSales.forEach(m => {
        if (m.pv > bestMonth.pv) {
            bestMonth = { month: m.name.split(' ')[0], year: m.monthKey.split('-')[0], pv: m.pv };
        }
    });

    const yearStats = {};
    accOrders.forEach(order => {
        const year = new Date(order.createdAt).getFullYear();
        if (!yearStats[year]) yearStats[year] = { totalRevenue: 0, totalQuantity: 0 };
        yearStats[year].totalRevenue += order.recognizedRevenue;
        yearStats[year].totalQuantity += order.details.length;
    });

    let bestYear = { year: '-', totalRevenue: 0, totalQuantity: 0 };
    Object.keys(yearStats).forEach(y => {
        if (yearStats[y].totalRevenue > bestYear.totalRevenue) {
            bestYear = { year: y, ...yearStats[y] };
        }
    });

    const buyerStats = {};
    accOrders.forEach(order => {
        const resolvedName = (order.resolvedCustomerName || '').trim();
        if (!isValidCustomerName(resolvedName)) return;
        const buyerKey = resolvedName.toUpperCase();
        if (!buyerStats[buyerKey]) {
            buyerStats[buyerKey] = {
                totalAmount: 0,
                orderCount: 0,
                customerName: resolvedName,
                category: order.isAdminOrder ? 'Pesanan Admin' : (order.customerAccountUser?.customer?.category || 'Pesanan Customer')
            };
        }
        buyerStats[buyerKey].totalAmount += order.recognizedRevenue;
        buyerStats[buyerKey].orderCount += 1;
    });

    let topBuyerEntry = null;
    Object.values(buyerStats).forEach(entry => {
        if (!topBuyerEntry || entry.totalAmount > topBuyerEntry.totalAmount) {
            topBuyerEntry = entry;
        }
    });

    let topBuyer = { name: 'Belum ada', category: '-', initial: '-' };
    if (topBuyerEntry) {
        topBuyer = {
            name: topBuyerEntry.customerName,
            category: topBuyerEntry.category,
            initial: topBuyerEntry.customerName.substring(0, 3).toUpperCase()
        };
    }

    const newOrders = enrichedOrders
        .filter(o => isValidCustomerName(o.resolvedCustomerName))
        .slice(0, 5)
        .map(o => ({ name: o.resolvedCustomerName }));

    const uniqueOrderCustomersMap = new Map();
    enrichedOrders.forEach(order => {
        if (!isValidCustomerName(order.resolvedCustomerName)) return;
        const key = order.resolvedCustomerName.toUpperCase();
        if (!uniqueOrderCustomersMap.has(key)) {
            const productTitle = order.details?.[0]?.productTitle;
            const sourceLabel = order.isAdminOrder ? 'Pesanan Admin' : 'Pesanan Customer';
            uniqueOrderCustomersMap.set(key, {
                id: order.customerAccountUser ? order.customerAccountUser.id : order.id,
                customerId: order.customerAccountUser?.customer?.id || order.id,
                nama: order.resolvedCustomerName,
                email: order.customerAccountUser?.email || '',
                isAdminOrder: order.isAdminOrder,
                lastMessageAt: null,
                lastMessageContent: undefined,
                category: productTitle ? `${productTitle} • ${sourceLabel}` : sourceLabel
            });
        }
    });

    const totalCustomer = uniqueOrderCustomersMap.size;
    const recentCustomers = Array.from(uniqueOrderCustomersMap.values()).slice(0, 5);

    const recentChats = [];
    const totalUnreadChat = 0;

    let responseSalesData = { daily: dailySales, monthly: monthlySales, yearly: yearlySales, lifetime: lifetimeSales };

    if (filterYear) {
        if (filterMonth) {
            const filteredDailySales = [];
            const daysInMonth = new Date(filterYear, filterMonth, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${filterYear}-${String(filterMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const name = `${day} ${monthNames[filterMonth - 1]}`;
                filteredDailySales.push({ name, pv: 0, dateStr });
            }

            accOrders.forEach(order => {
                const date = new Date(order.createdAt);
                if (date.getFullYear() === filterYear && (date.getMonth() + 1) === filterMonth) {
                    const day = date.getDate();
                    if (filteredDailySales[day - 1]) {
                        filteredDailySales[day - 1].pv += order.recognizedRevenue;
                    }
                }
            });

            responseSalesData = {
                daily: filteredDailySales,
                monthly: [],
                yearly: [],
                lifetime: []
            };
        } else {
            const filteredMonthlySales = [];
            const maxMonths = filterYear === now.getFullYear() ? (now.getMonth() + 1) : 12;
            for (let m = 0; m < maxMonths; m++) {
                const name = `${monthNames[m]} ${String(filterYear).substring(2)}`;
                filteredMonthlySales.push({ name, pv: 0, monthKey: `${filterYear}-${m}` });
            }

            accOrders.forEach(order => {
                const date = new Date(order.createdAt);
                if (date.getFullYear() === filterYear) {
                    const m = date.getMonth();
                    if (filteredMonthlySales[m]) {
                        filteredMonthlySales[m].pv += order.recognizedRevenue;
                    }
                }
            });

            responseSalesData = {
                daily: [],
                monthly: filteredMonthlySales,
                yearly: [],
                lifetime: []
            };
        }
    }

    return {
        totalCustomer,
        totalStaff,
        totalAdmin,
        totalRevenue,
        salesData: responseSalesData,
        recentCustomers,
        recentChats,
        totalUnreadChat,
        bestMonth,
        bestYear,
        topBuyer,
        newOrders
    };
};

const getOmsetReport = async ({ startDate, endDate }) => {
    let dateFilter = {};
    if (startDate && endDate) {
        dateFilter = {
            gte: new Date(startDate + 'T00:00:00'),
            lte: new Date(endDate + 'T23:59:59.999')
        };
    }

    const dateWhere = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const orders = await prisma.jerseyOrder.findMany({
        where: {
            ...dateWhere,
            status: { not: 'DITOLAK' },
            NOT: {
                orderId: { startsWith: 'SEED-' }
            }
        },
        include: { details: true }
    });

    let totalPemasukan = 0;
    const revenueBreakdownMap = {};

    orders.forEach(order => {
        const recognizedRevenue = getOrderRecognizedRevenue(order);
        if (recognizedRevenue <= 0) return;

        totalPemasukan += recognizedRevenue;

        let title = 'Lain-lain';
        if (order.details && order.details.length > 0) {
            title = order.details[0].productTitle || 'Produk Custom';
        }

        if (!revenueBreakdownMap[title]) revenueBreakdownMap[title] = 0;
        revenueBreakdownMap[title] += recognizedRevenue;
    });

    const revenueBreakdown = Object.keys(revenueBreakdownMap).map(name => ({
        nama: name,
        total: revenueBreakdownMap[name]
    }));

    const expenses = await prisma.bahanBajuHistory.aggregate({
        where: {
            aksi: { in: ['BUAT', 'TAMBAH'] },
            ...dateWhere
        },
        _sum: { totalNilai: true }
    });
    const totalPengeluaran = expenses._sum.totalNilai || 0;
    const netProfit = totalPemasukan - totalPengeluaran;

    const materials = await prisma.bahanBaju.findMany({
        include: {
            histories: {
                where: dateWhere
            }
        }
    });

    const bahanPerformance = materials.map(m => {
        let totalDibeli = 0;
        let totalPemanfaatan = 0;
        let totalModal = 0;

        m.histories.forEach(h => {
            if (h.aksi === 'BUAT' || h.aksi === 'TAMBAH') {
                totalDibeli += h.jumlah;
                totalModal += (h.totalNilai || 0);
            } else if (h.aksi === 'KURANG') {
                totalPemanfaatan += Math.abs(h.jumlah);
            }
        });

        return {
            id: m.id,
            nama: m.nama,
            imageUrl: m.imageUrl,
            buktiNotaUrl: m.buktiNotaUrl,
            hargaBeli: m.hargaBeli,
            hargaJual: m.harga,
            totalDibeli,
            totalModal,
            sisaStok: m.kuantitasKg,
            pemanfaatan: totalPemanfaatan,
            totalPendapatanBahan: totalPemanfaatan * (m.harga || 0)
        };
    }).filter(m => m.totalDibeli > 0 || m.pemanfaatan > 0 || m.sisaStok > 0);

    return {
        totalPemasukan,
        totalPengeluaran,
        netProfit,
        bahanPerformance,
        revenueBreakdown
    };
};

module.exports = {
    getDashboardStats,
    getOmsetReport
};
