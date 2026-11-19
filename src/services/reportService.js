const reportRepository = require('../repositories/reportRepository');
const financeTransactionRepository = require('../repositories/financeTransactionRepository');
const {
    DAY_NAMES_SHORT,
    MONTH_NAMES_SHORT,
    getWibParts,
    toWibDateKey,
    resolvePeriod
} = require('../utils/wibDateUtils');

const INVALID_CUSTOMER_NAMES = new Set([
    '', 'ADMIN', 'STAFF FCSV', 'MANAGER', 'DESAIN', 'GUDANG', 'GUEST USER', 'PELANGGAN', 'TANPA NAMA'
]);

const isValidCustomerName = (name) => {
    if (!name || typeof name !== 'string') return false;
    return !INVALID_CUSTOMER_NAMES.has(name.trim().toUpperCase());
};

const getOrderRecognizedRevenue = (order) => {
    if (!order || order.status === 'DITOLAK' || order.status === 'BATAL') return 0;
    if (String(order.orderId || '').startsWith('SEED-')) return 0;

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

const accumulateToBucket = (bucketMap, key, tx) => {
    const bucket = bucketMap.get(key);
    if (!bucket) return;
    if (tx.type === 'PEMASUKAN') bucket.pemasukan += tx.amount;
    else bucket.pengeluaran += tx.amount;
};

const buildChartBuckets = (period, transactions) => {
    const nowWib = getWibParts();
    const buckets = [];
    const bucketMap = new Map();

    const addBucket = (key, label) => {
        const bucket = {
            key,
            label,
            name: label,
            pemasukan: 0,
            pengeluaran: 0,
            net: 0,
            pv: 0
        };
        buckets.push(bucket);
        bucketMap.set(key, bucket);
    };

    let mode = period.periodType;
    if (mode === 'custom' && period.start && period.end) {
        const diffDays = Math.ceil((period.end.getTime() - period.start.getTime()) / (24 * 60 * 60 * 1000));
        mode = diffDays <= 62 ? 'custom-daily' : 'custom-monthly';
    }

    if (mode === 'daily') {
        for (let h = 0; h < 24; h++) {
            const hh = String(h).padStart(2, '0');
            addBucket(hh, `${hh}:00`);
        }
        transactions.forEach((tx) => {
            const { hour } = getWibParts(tx.transactionDate);
            accumulateToBucket(bucketMap, String(hour).padStart(2, '0'), tx);
        });
    } else if (mode === 'weekly') {
        const startParts = getWibParts(period.start);
        const endParts = getWibParts(period.end);
        let cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
        const endCursor = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));
        while (cursor <= endCursor) {
            const y = cursor.getUTCFullYear();
            const m = cursor.getUTCMonth() + 1;
            const d = cursor.getUTCDate();
            const dow = DAY_NAMES_SHORT[cursor.getUTCDay()];
            const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            addBucket(key, `${dow}, ${d} ${MONTH_NAMES_SHORT[m - 1]}`);
            cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        }
        transactions.forEach((tx) => {
            accumulateToBucket(bucketMap, tx.dateWib, tx);
        });
    } else if (mode === 'monthly') {
        const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
        const mm = String(period.month).padStart(2, '0');
        for (let day = 1; day <= daysInMonth; day++) {
            const dd = String(day).padStart(2, '0');
            const dateKey = `${period.year}-${mm}-${dd}`;
            addBucket(dateKey, `${day} ${MONTH_NAMES_SHORT[period.month - 1]}`);
        }
        transactions.forEach((tx) => {
            accumulateToBucket(bucketMap, tx.dateWib, tx);
        });
    } else if (mode === 'yearly') {
        const yy = String(period.year).slice(-2);
        for (let m = 1; m <= 12; m++) {
            const monthKey = `${period.year}-${String(m).padStart(2, '0')}`;
            addBucket(monthKey, `${MONTH_NAMES_SHORT[m - 1]} ${yy}`);
        }
        transactions.forEach((tx) => {
            const { year, month } = getWibParts(tx.transactionDate);
            accumulateToBucket(bucketMap, `${year}-${String(month).padStart(2, '0')}`, tx);
        });
    } else if (mode === 'custom-daily') {
        const startParts = getWibParts(period.start);
        const endParts = getWibParts(period.end);
        let cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
        const endCursor = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));
        while (cursor <= endCursor) {
            const y = cursor.getUTCFullYear();
            const m = cursor.getUTCMonth() + 1;
            const d = cursor.getUTCDate();
            const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            addBucket(key, `${d} ${MONTH_NAMES_SHORT[m - 1]}`);
            cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        }
        transactions.forEach((tx) => {
            accumulateToBucket(bucketMap, tx.dateWib, tx);
        });
    } else if (mode === 'custom-monthly') {
        const startParts = getWibParts(period.start);
        const endParts = getWibParts(period.end);
        let y = startParts.year;
        let m = startParts.month;
        while (y < endParts.year || (y === endParts.year && m <= endParts.month)) {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            addBucket(key, `${MONTH_NAMES_SHORT[m - 1]} ${String(y).slice(-2)}`);
            m += 1;
            if (m > 12) {
                m = 1;
                y += 1;
            }
        }
        transactions.forEach((tx) => {
            const { year, month } = getWibParts(tx.transactionDate);
            accumulateToBucket(bucketMap, `${year}-${String(month).padStart(2, '0')}`, tx);
        });
    } else {
        let minYear = Math.min(2022, nowWib.year);
        let maxYear = nowWib.year;
        transactions.forEach((tx) => {
            const { year } = getWibParts(tx.transactionDate);
            if (year < minYear) minYear = year;
            if (year > maxYear) maxYear = year;
        });
        for (let y = minYear; y <= maxYear; y++) {
            addBucket(String(y), String(y));
        }
        transactions.forEach((tx) => {
            const { year } = getWibParts(tx.transactionDate);
            accumulateToBucket(bucketMap, String(year), tx);
        });
    }

    buckets.forEach((b) => {
        b.net = b.pemasukan - b.pengeluaran;
        b.pv = b.pemasukan;
    });

    return buckets;
};

const buildBahanPerformance = (materials) => {
    return materials
        .map((m) => {
            let totalDibeli = 0;
            let totalPemanfaatan = 0;
            let totalModal = 0;

            (m.histories || []).forEach((h) => {
                if (h.aksi === 'BUAT' || h.aksi === 'TAMBAH' || h.aksi === 'TAMBAH_STOK') {
                    totalDibeli += Number(h.jumlah) || 0;
                    totalModal += Number(h.totalNilai) || 0;
                } else if (h.aksi === 'KURANG') {
                    totalPemanfaatan += Math.abs(Number(h.jumlah) || 0);
                }
            });

            const sisaStok = Number(m.kuantitasKg) || 0;
            const hargaBeli = Number(m.hargaBeli) || 0;
            const hargaJual = Number(m.harga) || 0;
            const roundedStok = Math.round(sisaStok * 100) / 100;
            const roundedPakai = Math.round(totalPemanfaatan * 100) / 100;
            const effectiveDibeli = totalDibeli > 0
                ? Math.round(totalDibeli * 100) / 100
                : Math.round((roundedStok + roundedPakai) * 100) / 100;
            const effectiveModal = totalModal > 0 ? totalModal : hargaBeli;
            const nilaiAset = roundedStok > 0
                ? Math.round(roundedStok * (hargaBeli > 0 ? hargaBeli : hargaJual))
                : (m.status !== 'Habis' && hargaBeli > 0 ? Math.round(hargaBeli) : 0);

            return {
                id: m.id,
                kode: `BHN-${String(m.id).padStart(3, '0')}`,
                nama: m.nama,
                status: m.status || 'Tersedia',
                imageUrl: m.imageUrl,
                buktiNotaUrl: m.buktiNotaUrl,
                hargaBeli: m.hargaBeli,
                hargaJual: m.harga,
                totalDibeli: effectiveDibeli,
                totalModal: effectiveModal,
                nilaiAset,
                sisaStok: roundedStok,
                pemanfaatan: roundedPakai,
                totalPendapatanBahan: totalPemanfaatan * (m.harga || 0)
            };
        })
        .filter((m) => m.totalDibeli > 0 || m.pemanfaatan > 0 || m.sisaStok > 0 || m.totalModal > 0 || (Number(m.hargaBeli) || 0) > 0);
};

const getFinanceOverview = async (query = {}) => {
    const period = resolvePeriod(query);
    const rangeFilter = period.start && period.end ? { start: period.start, end: period.end } : {};

    const [orders, bahanHistories, manualTransactions, materials] = await Promise.all([
        reportRepository.findOrdersForReporting(rangeFilter),
        reportRepository.findBahanPurchaseHistories(rangeFilter),
        financeTransactionRepository.findMany(rangeFilter),
        reportRepository.findAllBahanWithHistories(rangeFilter)
    ]);

    let orderPemasukan = 0;
    let manualPemasukan = 0;
    let bahanPengeluaran = 0;
    let manualPengeluaran = 0;
    const revenueBreakdownMap = {};
    const allTransactions = [];

    orders.forEach((order) => {
        const amount = getOrderRecognizedRevenue(order);
        if (amount <= 0) return;

        orderPemasukan += amount;

        const productTitle = order.details?.[0]?.productTitle || 'Produk Custom';
        revenueBreakdownMap[productTitle] = (revenueBreakdownMap[productTitle] || 0) + amount;

        const customerLabel = (order.customerName || '').trim();
        const title = customerLabel ? `${order.orderId} - ${customerLabel}` : order.orderId;
        const receiptUrl = typeof order.paymentUrl === 'string' && order.paymentUrl.startsWith('/uploads/')
            ? order.paymentUrl
            : null;

        allTransactions.push({
            id: `ORDER-${order.id}`,
            rawId: order.id,
            source: 'ORDER',
            type: 'PEMASUKAN',
            category: 'Penjualan Jersey',
            title,
            description: `${productTitle} (${order.status})`,
            amount,
            transactionDate: new Date(order.createdAt).toISOString(),
            dateWib: toWibDateKey(order.createdAt),
            paymentMethod: order.paymentType || 'TRANSFER',
            buktiNotaUrl: receiptUrl,
            actorName: customerLabel || 'Pelanggan',
            editable: false
        });
    });

    bahanHistories.forEach((h) => {
        if (!['BUAT', 'TAMBAH', 'TAMBAH_STOK'].includes(h.aksi)) return;
        const amount = Number(h.totalNilai) || 0;
        if (amount <= 0) return;

        bahanPengeluaran += amount;
        const materialName = h.namaBahan || h.bahan?.nama || 'Bahan Baku';

        allTransactions.push({
            id: `BAHAN-${h.id}`,
            rawId: h.id,
            source: 'BAHAN_BAKU',
            type: 'PENGELUARAN',
            category: 'Pembelian Bahan Baku',
            title: `Stok ${materialName}`,
            description: h.keterangan || `${h.jumlah} kg (${h.aksi})`,
            amount,
            transactionDate: new Date(h.createdAt).toISOString(),
            dateWib: toWibDateKey(h.createdAt),
            paymentMethod: null,
            buktiNotaUrl: h.buktiNotaUrl || h.bahan?.buktiNotaUrl || null,
            actorName: h.customerName || h.actor || 'Gudang',
            editable: false
        });
    });

    manualTransactions.forEach((ft) => {
        const amount = Number(ft.amount) || 0;
        if (amount <= 0) return;

        if (ft.type === 'PEMASUKAN') {
            manualPemasukan += amount;
            const breakdownKey = `Manual: ${ft.category}`;
            revenueBreakdownMap[breakdownKey] = (revenueBreakdownMap[breakdownKey] || 0) + amount;
        } else {
            manualPengeluaran += amount;
        }

        allTransactions.push({
            id: `MANUAL-${ft.id}`,
            rawId: ft.id,
            source: 'MANUAL',
            type: ft.type,
            category: ft.category,
            title: ft.title,
            description: ft.description || null,
            amount,
            transactionDate: new Date(ft.transactionDate).toISOString(),
            dateWib: toWibDateKey(ft.transactionDate),
            paymentMethod: ft.paymentMethod || null,
            buktiNotaUrl: ft.buktiNotaUrl || null,
            actorName: ft.createdByName || ft.createdBy?.staff?.nama || ft.createdBy?.username || 'Admin',
            editable: true
        });
    });

    allTransactions.sort((a, b) => {
        const timeDiff = new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
    });

    const totalPemasukan = orderPemasukan + manualPemasukan;
    const totalPengeluaran = bahanPengeluaran + manualPengeluaran;
    const netProfit = totalPemasukan - totalPengeluaran;

    const pemasukanCount = allTransactions.filter((t) => t.type === 'PEMASUKAN').length;
    const pengeluaranCount = allTransactions.filter((t) => t.type === 'PENGELUARAN').length;

    const summary = {
        totalPemasukan,
        totalPengeluaran,
        netProfit,
        orderPemasukan,
        manualPemasukan,
        bahanPengeluaran,
        manualPengeluaran,
        transactionCount: allTransactions.length,
        pemasukanCount,
        pengeluaranCount
    };

    const typeFilter = query.type ? String(query.type).trim().toUpperCase() : 'ALL';
    if (typeFilter !== 'ALL' && typeFilter !== 'PEMASUKAN' && typeFilter !== 'PENGELUARAN') {
        const err = new Error('Filter type harus ALL, PEMASUKAN, atau PENGELUARAN');
        err.statusCode = 400;
        throw err;
    }

    const sourceFilter = query.source ? String(query.source).trim().toUpperCase() : 'ALL';
    if (sourceFilter !== 'ALL' && !['ORDER', 'BAHAN_BAKU', 'MANUAL'].includes(sourceFilter)) {
        const err = new Error('Filter source harus ALL, ORDER, BAHAN_BAKU, atau MANUAL');
        err.statusCode = 400;
        throw err;
    }

    const searchQuery = query.search ? String(query.search).trim().toLowerCase() : '';

    const filteredTransactions = allTransactions.filter((tx) => {
        if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
        if (sourceFilter !== 'ALL' && tx.source !== sourceFilter) return false;
        if (searchQuery) {
            const haystack = `${tx.id} ${tx.title} ${tx.category} ${tx.description || ''} ${tx.actorName || ''}`.toLowerCase();
            if (!haystack.includes(searchQuery)) return false;
        }
        return true;
    });

    const chartData = buildChartBuckets(period, allTransactions);
    const bahanPerformance = buildBahanPerformance(materials);
    const revenueBreakdown = Object.keys(revenueBreakdownMap)
        .map((name) => ({
            nama: name,
            total: revenueBreakdownMap[name],
            percentage: totalPemasukan > 0
                ? Math.round((revenueBreakdownMap[name] / totalPemasukan) * 100)
                : 0
        }))
        .sort((a, b) => b.total - a.total);

    const expenseBreakdownMap = {};
    allTransactions.forEach((tx) => {
        if (tx.type !== 'PENGELUARAN' || tx.amount <= 0) return;
        const label = tx.source === 'BAHAN_BAKU'
            ? (tx.title.replace(/^Stok\s+/i, '').trim() || 'Bahan Baku')
            : (tx.category || 'Operasional');
        expenseBreakdownMap[label] = (expenseBreakdownMap[label] || 0) + tx.amount;
    });
    const expenseBreakdown = Object.keys(expenseBreakdownMap)
        .map((nama) => ({
            nama,
            total: expenseBreakdownMap[nama],
            percentage: totalPengeluaran > 0
                ? Math.round((expenseBreakdownMap[nama] / totalPengeluaran) * 100)
                : 0
        }))
        .sort((a, b) => b.total - a.total);

    const inventorySummary = {
        nilaiPersediaan: bahanPerformance.reduce((sum, b) => sum + (Number(b.totalModal) || Number(b.nilaiAset) || 0), 0),
        activeBahanCount: bahanPerformance.filter((b) => b.status !== 'Habis').length
    };

    return {
        period: {
            periodType: period.periodType,
            date: period.date,
            month: period.month,
            year: period.year,
            startDate: period.startDate,
            endDate: period.endDate,
            label: period.label,
            slug: period.slug
        },
        summary,
        inventorySummary,
        chartData,
        transactions: filteredTransactions,
        bahanPerformance,
        revenueBreakdown,
        expenseBreakdown
    };
};

const getOmsetReport = async (query = {}) => {
    const overview = await getFinanceOverview(query);
    return {
        ...overview,
        totalPemasukan: overview.summary.totalPemasukan,
        totalPengeluaran: overview.summary.totalPengeluaran,
        netProfit: overview.summary.netProfit
    };
};

const getDashboardStats = async ({ year, month } = {}) => {
    const nowWib = getWibParts();
    const filterYear = year ? parseInt(year, 10) : null;
    const filterMonth = month ? parseInt(month, 10) : null;

    const [{ totalStaff, totalAdmin }, rawOrders, manualIncomes] = await Promise.all([
        reportRepository.countStaffAndAdmin(),
        reportRepository.findOrdersForReporting(),
        financeTransactionRepository.findMany({ type: 'PEMASUKAN' })
    ]);

    const orderUserIds = [...new Set(rawOrders.map((o) => o.customerId).filter(Boolean))];
    const orderUsers = await reportRepository.findOrderUsersByIds(orderUserIds);
    const orderUserMap = new Map(orderUsers.map((u) => [u.id, u]));

    const enrichedOrders = rawOrders.map((order) => {
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

    const accOrders = enrichedOrders.filter((order) => order.recognizedRevenue > 0);
    const orderRevenue = accOrders.reduce((sum, order) => sum + order.recognizedRevenue, 0);
    const manualRevenue = manualIncomes.reduce((sum, ft) => sum + (Number(ft.amount) || 0), 0);
    const totalRevenue = orderRevenue + manualRevenue;

    const revenueEvents = [
        ...accOrders.map((o) => ({ date: o.createdAt, amount: o.recognizedRevenue })),
        ...manualIncomes.map((ft) => ({ date: ft.transactionDate, amount: Number(ft.amount) || 0 }))
    ];

    const dailySales = [];
    const todayUtcMid = Date.UTC(nowWib.year, nowWib.month - 1, nowWib.day);
    for (let i = 29; i >= 0; i--) {
        const dayUtc = new Date(todayUtcMid - i * 24 * 60 * 60 * 1000);
        const y = dayUtc.getUTCFullYear();
        const m = dayUtc.getUTCMonth() + 1;
        const d = dayUtc.getUTCDate();
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dailySales.push({ name: `${d} ${MONTH_NAMES_SHORT[m - 1]}`, pv: 0, dateStr });
    }

    const monthlySales = [];
    for (let i = 11; i >= 0; i--) {
        let m = nowWib.month - i;
        let y = nowWib.year;
        while (m <= 0) {
            m += 12;
            y -= 1;
        }
        monthlySales.push({
            name: `${MONTH_NAMES_SHORT[m - 1]} ${String(y).slice(2)}`,
            pv: 0,
            monthKey: `${y}-${m - 1}`
        });
    }

    const startYear = 2022;
    const yearlySales = [];
    for (let y = startYear; y <= nowWib.year; y++) {
        yearlySales.push({ name: `${y}`, pv: 0, year: y });
    }

    const lifetimeSales = [];
    let tempYear = startYear;
    let tempMonth = 0;
    const currentMonthZeroIdx = nowWib.month - 1;
    while (tempYear < nowWib.year || (tempYear === nowWib.year && tempMonth <= currentMonthZeroIdx)) {
        lifetimeSales.push({
            name: `${MONTH_NAMES_SHORT[tempMonth]} ${String(tempYear).slice(2)}`,
            pv: 0,
            monthKey: `${tempYear}-${tempMonth}`
        });
        tempMonth += 1;
        if (tempMonth > 11) {
            tempMonth = 0;
            tempYear += 1;
        }
    }

    revenueEvents.forEach((ev) => {
        const wib = getWibParts(ev.date);
        const monthKey = `${wib.year}-${wib.month - 1}`;

        const dayObj = dailySales.find((d) => d.dateStr === wib.dateStr);
        if (dayObj) dayObj.pv += ev.amount;

        const monthObj = monthlySales.find((m) => m.monthKey === monthKey);
        if (monthObj) monthObj.pv += ev.amount;

        const yearObj = yearlySales.find((y) => y.year === wib.year);
        if (yearObj) yearObj.pv += ev.amount;

        const lifetimeObj = lifetimeSales.find((l) => l.monthKey === monthKey);
        if (lifetimeObj) lifetimeObj.pv += ev.amount;
    });

    let bestMonth = { month: 'Belum ada', year: '-', pv: 0 };
    lifetimeSales.forEach((m) => {
        if (m.pv > bestMonth.pv) {
            bestMonth = { month: m.name.split(' ')[0], year: m.monthKey.split('-')[0], pv: m.pv };
        }
    });

    const yearStats = {};
    accOrders.forEach((order) => {
        const { year: orderYear } = getWibParts(order.createdAt);
        if (!yearStats[orderYear]) yearStats[orderYear] = { totalRevenue: 0, totalQuantity: 0 };
        yearStats[orderYear].totalRevenue += order.recognizedRevenue;
        yearStats[orderYear].totalQuantity += order.details.length;
    });
    manualIncomes.forEach((ft) => {
        const { year: txYear } = getWibParts(ft.transactionDate);
        if (!yearStats[txYear]) yearStats[txYear] = { totalRevenue: 0, totalQuantity: 0 };
        yearStats[txYear].totalRevenue += Number(ft.amount) || 0;
    });

    let bestYear = { year: '-', totalRevenue: 0, totalQuantity: 0 };
    Object.keys(yearStats).forEach((y) => {
        if (yearStats[y].totalRevenue > bestYear.totalRevenue) {
            bestYear = { year: y, ...yearStats[y] };
        }
    });

    const buyerStats = {};
    accOrders.forEach((order) => {
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
    Object.values(buyerStats).forEach((entry) => {
        if (!topBuyerEntry || entry.totalAmount > topBuyerEntry.totalAmount) {
            topBuyerEntry = entry;
        }
    });

    const topBuyer = topBuyerEntry
        ? {
            name: topBuyerEntry.customerName,
            category: topBuyerEntry.category,
            initial: topBuyerEntry.customerName.substring(0, 3).toUpperCase()
        }
        : { name: 'Belum ada', category: '-', initial: '-' };

    const newOrders = enrichedOrders
        .filter((o) => isValidCustomerName(o.resolvedCustomerName))
        .slice(0, 5)
        .map((o) => ({ name: o.resolvedCustomerName }));

    const uniqueOrderCustomersMap = new Map();
    enrichedOrders.forEach((order) => {
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

    let responseSalesData = { daily: dailySales, monthly: monthlySales, yearly: yearlySales, lifetime: lifetimeSales };

    if (filterYear) {
        if (filterMonth) {
            const filteredDailySales = [];
            const daysInMonth = new Date(Date.UTC(filterYear, filterMonth, 0)).getUTCDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${filterYear}-${String(filterMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                filteredDailySales.push({
                    name: `${day} ${MONTH_NAMES_SHORT[filterMonth - 1]}`,
                    pv: 0,
                    dateStr
                });
            }

            revenueEvents.forEach((ev) => {
                const wib = getWibParts(ev.date);
                if (wib.year === filterYear && wib.month === filterMonth && filteredDailySales[wib.day - 1]) {
                    filteredDailySales[wib.day - 1].pv += ev.amount;
                }
            });

            responseSalesData = { daily: filteredDailySales, monthly: [], yearly: [], lifetime: [] };
        } else {
            const filteredMonthlySales = [];
            const maxMonths = filterYear === nowWib.year ? nowWib.month : 12;
            for (let m = 0; m < maxMonths; m++) {
                filteredMonthlySales.push({
                    name: `${MONTH_NAMES_SHORT[m]} ${String(filterYear).slice(2)}`,
                    pv: 0,
                    monthKey: `${filterYear}-${m}`
                });
            }

            revenueEvents.forEach((ev) => {
                const wib = getWibParts(ev.date);
                if (wib.year === filterYear && filteredMonthlySales[wib.month - 1]) {
                    filteredMonthlySales[wib.month - 1].pv += ev.amount;
                }
            });

            responseSalesData = { daily: [], monthly: filteredMonthlySales, yearly: [], lifetime: [] };
        }
    }

    return {
        totalCustomer,
        totalStaff,
        totalAdmin,
        totalRevenue,
        salesData: responseSalesData,
        recentCustomers,
        recentChats: [],
        totalUnreadChat: 0,
        bestMonth,
        bestYear,
        topBuyer,
        newOrders
    };
};

module.exports = {
    getOrderRecognizedRevenue,
    getFinanceOverview,
    getOmsetReport,
    getDashboardStats
};
