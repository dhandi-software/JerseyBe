const prisma = require('../config/prisma');

const getDashboardStats = async ({ year, month }) => {
    const now = new Date();
    const filterYear = year ? parseInt(year) : null;
    const filterMonth = month ? parseInt(month) : null;

    const [totalCustomer, totalStaff, totalAdmin] = await Promise.all([
        prisma.user.count({ where: { role: 'customer' } }),
        prisma.user.count({ where: { role: { in: ['desain', 'gudang', 'manager'] } } }),
        prisma.user.count({ where: { role: 'admin' } })
    ]);

    const accOrders = await prisma.jerseyOrder.findMany({
        where: {
            status: { notIn: ['MENUNGGU', 'DITOLAK'] }
        },
        select: {
            id: true,
            customerId: true,
            totalAmount: true,
            createdAt: true,
            details: { select: { id: true } }
        }
    });

    const totalRevenue = accOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    const dailySales = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
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
        const dateStr = date.toISOString().split('T')[0];
        const orderYear = date.getFullYear();
        const orderMonth = date.getMonth();
        const monthKey = `${orderYear}-${orderMonth}`;

        const dayObj = dailySales.find(d => d.dateStr === dateStr);
        if (dayObj) dayObj.pv += order.totalAmount;

        const monthObj = monthlySales.find(m => m.monthKey === monthKey);
        if (monthObj) monthObj.pv += order.totalAmount;

        const yearObj = yearlySales.find(y => y.year === orderYear);
        if (yearObj) yearObj.pv += order.totalAmount;

        const lifetimeObj = lifetimeSales.find(l => l.monthKey === monthKey);
        if (lifetimeObj) lifetimeObj.pv += order.totalAmount;
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
        yearStats[year].totalRevenue += order.totalAmount;
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
        if (!buyerStats[order.customerId]) buyerStats[order.customerId] = { totalAmount: 0, orderCount: 0 };
        buyerStats[order.customerId].totalAmount += order.totalAmount;
        buyerStats[order.customerId].orderCount += 1;
    });

    let topBuyerId = null;
    let topBuyerAmount = 0;
    Object.keys(buyerStats).forEach(cid => {
        if (buyerStats[cid].totalAmount > topBuyerAmount) {
            topBuyerAmount = buyerStats[cid].totalAmount;
            topBuyerId = parseInt(cid);
        }
    });

    let topBuyer = { name: 'Belum ada', category: '-', initial: '-' };
    if (topBuyerId) {
        const customer = await prisma.customer.findUnique({ where: { userId: topBuyerId } });
        if (customer) {
            topBuyer = {
                name: customer.nama,
                category: customer.category || 'General',
                initial: customer.nama.substring(0, 3).toUpperCase()
            };
        }
    }

    const latestOrdersRaw = await prisma.jerseyOrder.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, customerId: true }
    });

    const newOrders = [];
    for (const lo of latestOrdersRaw) {
        const customer = await prisma.customer.findUnique({ where: { userId: lo.customerId } });
        if (customer) {
            newOrders.push({ name: customer.nama });
        }
    }

    const recentMessages = await prisma.message.findMany({
        where: {
            OR: [
                { sender: { role: 'customer' }, receiver: { role: 'admin' } },
                { sender: { role: 'admin' }, receiver: { role: 'customer' } }
            ]
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { sender: { include: { customer: true } }, receiver: { include: { customer: true } } }
    });

    const recentChattersMap = new Map();
    recentMessages.forEach(msg => {
        if (msg.sender?.customer && !recentChattersMap.has(msg.sender.id)) {
            recentChattersMap.set(msg.sender.id, {
                id: msg.sender.id, customerId: msg.sender.customer.id, nama: msg.sender.customer.nama,
                email: msg.sender.email, lastMessageAt: msg.createdAt,
                lastMessageContent: msg.content || (msg.attachmentName ? `📎 ${msg.attachmentName}` : (msg.attachmentUrl ? '📎 Lampiran' : 'Pesan baru')),
                category: msg.sender.customer.category || 'General Customer'
            });
        }
        if (msg.receiver?.customer && !recentChattersMap.has(msg.receiver.id)) {
            recentChattersMap.set(msg.receiver.id, {
                id: msg.receiver.id, customerId: msg.receiver.customer.id, nama: msg.receiver.customer.nama,
                email: msg.receiver.email, lastMessageAt: msg.createdAt,
                lastMessageContent: msg.content || (msg.attachmentName ? `📎 ${msg.attachmentName}` : (msg.attachmentUrl ? '📎 Lampiran' : 'Pesan baru')),
                category: msg.receiver.customer.category || 'General Customer'
            });
        }
    });

    let recentCustomers = Array.from(recentChattersMap.values()).slice(0, 5);

    if (recentCustomers.length < 5) {
        const latestCustomers = await prisma.customer.findMany({
            where: { userId: { notIn: recentCustomers.map(c => c.id) } },
            include: { user: { select: { id: true, email: true } } },
            orderBy: { id: 'desc' },
            take: 5 - recentCustomers.length
        });
        recentCustomers = [...recentCustomers, ...latestCustomers.map(c => ({
            id: c.user.id, customerId: c.id, nama: c.nama, email: c.user.email,
            lastMessageAt: null, category: c.category || 'New Customer'
        }))];
    }

    const recentChatsData = await prisma.message.findMany({
        where: {
            OR: [
                { sender: { role: 'admin' } },
                { receiver: { role: 'admin' } }
            ]
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: {
            sender: { select: { id: true, username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } },
            receiver: { select: { id: true, username: true, role: true, customer: { select: { nama: true } }, staff: { select: { nama: true } } } }
        }
    });

    const recentChats = recentChatsData.map(chat => {
        const isSenderAdmin = chat.sender?.role?.toLowerCase() === 'admin';
        const partnerId = isSenderAdmin ? chat.receiverId : chat.senderId;
        return {
            id: chat.id,
            content: chat.content || (chat.attachmentName ? `📎 ${chat.attachmentName}` : (chat.attachmentUrl ? '📎 Lampiran file' : '')),
            senderName: chat.sender?.customer?.nama || chat.sender?.staff?.nama || chat.sender?.username || 'Unknown',
            senderRole: chat.sender?.role,
            createdAt: chat.createdAt,
            isRead: chat.isRead,
            partnerId
        };
    });

    const totalUnreadChat = await prisma.message.count({
        where: { isRead: false, receiver: { role: 'admin' } }
    });

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
                        filteredDailySales[day - 1].pv += order.totalAmount;
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
                        filteredMonthlySales[m].pv += order.totalAmount;
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
            gte: new Date(startDate),
            lte: new Date(endDate + 'T23:59:59.999Z')
        };
    }

    const dateWhere = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const orders = await prisma.jerseyOrder.findMany({
        where: dateWhere,
        include: { details: true }
    });

    let totalPemasukan = 0;
    const revenueBreakdownMap = {};

    orders.forEach(order => {
        totalPemasukan += order.totalAmount;

        let title = 'Lain-lain';
        if (order.details && order.details.length > 0) {
            title = order.details[0].productTitle || 'Produk Custom';
        }

        if (!revenueBreakdownMap[title]) revenueBreakdownMap[title] = 0;
        revenueBreakdownMap[title] += order.totalAmount;
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
