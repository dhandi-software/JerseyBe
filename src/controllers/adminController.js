const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const createCustomer = async (req, res) => {
    try {
        let { email, password, nama } = req.body;

        if (!email || !password || !nama) {
            return res.status(400).json({ message: "Email, password, and name are required" });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await prisma.$transaction(async (prisma) => {
            const user = await prisma.user.create({
                data: {
                    username: email,
                    email,
                    password: hashedPassword,
                    role: 'customer',
                }
            });

            const customer = await prisma.customer.create({
                data: {
                    userId: user.id,
                    nama
                }
            });

            return { user, customer };
        });

        res.status(201).json({ message: "Customer account created successfully", data: result });

    } catch (error) {
        console.error("Error creating customer:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const createTeamInternal = async (req, res) => {
    try {
        let { email, password, nama, role } = req.body;

        if (!email || !password || !nama || !role) {
            return res.status(400).json({ message: "Email, password, name, and role are required" });
        }

        const validRoles = ['desain', 'gudang', 'manager', 'admin'];
        if (!validRoles.includes(role.toLowerCase())) {
            return res.status(400).json({ message: "Invalid internal role" });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // Role Hierarchy Check: Admin cannot create Manager, but Manager can create Admin
        const creatorRole = req.user?.role?.toLowerCase();
        if (creatorRole === 'admin' && role.toLowerCase() === 'manager') {
            return res.status(403).json({ message: "Administrator tidak diizinkan membuat akun Manager" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await prisma.$transaction(async (prisma) => {
            const user = await prisma.user.create({
                data: {
                    username: email,
                    email,
                    password: hashedPassword,
                    role: role.toLowerCase(),
                }
            });

            const staff = await prisma.staff.create({
                data: {
                    userId: user.id,
                    nama
                }
            });

            return { user, staff };
        });

        res.status(201).json({ message: "Staff account created successfully", data: result });

    } catch (error) {
        console.error("Error creating staff:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getUserCountByRole = async (req, res) => {
    try {
        const { role } = req.query;
        if (!role) return res.status(400).json({ message: "Role is required" });

        const count = await prisma.user.count({
            where: { role: role.toLowerCase() }
        });

        res.json({ object: "user", type: role, count });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getUsersByRole = async (req, res) => {
    try {
        const { role } = req.query;
        if (!role) return res.status(400).json({ message: "Role is required" });

        let users;
        const lowerRole = role.toLowerCase();

        if (lowerRole === 'customer') {
            users = await prisma.customer.findMany({
                include: { user: { select: { email: true, id: true, role: true } } }
            });
        } else if (['desain', 'manager', 'gudang', 'admin'].includes(lowerRole)) {
            users = await prisma.staff.findMany({
                where: { user: { role: lowerRole } },
                include: { user: { select: { email: true, id: true, role: true } } }
            });
        } else {
            users = await prisma.user.findMany({
                where: { role: lowerRole },
                select: { id: true, email: true, username: true, role: true }
            });
        }

        res.json({ data: users });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password, role, ...profileData } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: { customer: true, staff: true }
        });
        if (!user) return res.status(404).json({ message: "User not found" });

        const updateData = {};
        if (email) updateData.email = email;
        if (password && password !== "********" && password !== user.password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await prisma.$transaction(async (prisma) => {
            if (Object.keys(updateData).length > 0) {
                await prisma.user.update({
                    where: { id: parseInt(id) },
                    data: updateData
                });
            }

            if (user.role === 'customer') {
                await prisma.customer.update({
                    where: { userId: parseInt(id) },
                    data: {
                        nama: profileData.name || profileData.nama,
                        phone: profileData.phone,
                        address: profileData.address,
                        category: profileData.category || profileData.jurusan,
                        memberSince: profileData.memberSince || profileData.tahunMasuk
                    }
                });
            } else if (['desain', 'manager', 'gudang', 'admin'].includes(user.role)) {
                await prisma.staff.update({
                    where: { userId: parseInt(id) },
                    data: {
                        nama: profileData.name || profileData.nama,
                        position: profileData.position || profileData.jabatan
                    }
                });
            }
        });

        res.json({ message: "User updated successfully" });

    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.$transaction(async (prisma) => {
            const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
            if (!user) throw new Error("User not found");

            if (user.role === 'customer') {
                await prisma.customer.delete({ where: { userId: parseInt(id) } });
            } else if (['desain', 'manager', 'gudang', 'admin'].includes(user.role)) {
                await prisma.staff.delete({ where: { userId: parseInt(id) } });
            }

            await prisma.user.delete({ where: { id: parseInt(id) } });
        });

        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Error deleting user:", error.message);
        if (error.message === "User not found") return res.status(404).json({ message: "User not found" });
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: { customer: true, staff: true }
        });

        if (!user) return res.status(404).json({ message: "User not found" });

        let userData = {
            id: user.id,
            email: user.email,
            role: user.role,
            password: user.password,
            ... (user.customer ? user.customer : {}),
            ... (user.staff ? user.staff : {})
        };

        res.json({ data: userData });

    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const filterYear = req.query.year ? parseInt(req.query.year) : null;
        const filterMonth = req.query.month ? parseInt(req.query.month) : null; // 1-indexed (1 = Jan, 12 = Dec)
        const [totalCustomer, totalStaff, totalAdmin] = await Promise.all([
            prisma.user.count({ where: { role: 'customer' } }),
            prisma.user.count({ where: { role: { in: ['desain', 'gudang', 'manager'] } } }),
            prisma.user.count({ where: { role: 'admin' } })
        ]);

        // Calculate Revenue and Transaction Trends
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

        // Prepare chart data
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

        // 1. Harian (daily) -> Last 30 days
        const dailySales = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const name = `${d.getDate()} ${monthNames[d.getMonth()]}`;
            dailySales.push({ name, pv: 0, dateStr });
        }

        // 2. Bulanan (monthly) -> Last 12 months (grouped by month name)
        const monthlySales = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const name = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
            monthlySales.push({ name, pv: 0, monthKey: `${d.getFullYear()}-${d.getMonth()}` });
        }

        // 3. Tahunan (yearly) -> starting from 2022 to current year dynamically
        const yearlySales = [];
        const currentYear = now.getFullYear();
        const startYear = 2022;
        for (let y = startYear; y <= currentYear; y++) {
            yearlySales.push({ name: `${y}`, pv: 0, year: y });
        }

        // 4. Lifetime (lifetime) -> from Jan 2026 to current month
        const lifetimeSales = [];
        let tempYear = startYear;
        let tempMonth = 0; // Jan
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

            // Populate daily
            const dayObj = dailySales.find(d => d.dateStr === dateStr);
            if (dayObj) dayObj.pv += order.totalAmount;

            // Populate monthly
            const monthObj = monthlySales.find(m => m.monthKey === monthKey);
            if (monthObj) monthObj.pv += order.totalAmount;

            // Populate yearly
            const yearObj = yearlySales.find(y => y.year === orderYear);
            if (yearObj) yearObj.pv += order.totalAmount;

            // Populate lifetime
            const lifetimeObj = lifetimeSales.find(l => l.monthKey === monthKey);
            if (lifetimeObj) lifetimeObj.pv += order.totalAmount;
        });

        // 1. Best Month
        let bestMonth = { month: "Belum ada", year: "-", pv: 0 };
        lifetimeSales.forEach(m => {
            if (m.pv > bestMonth.pv) {
                bestMonth = { month: m.name.split(' ')[0], year: m.monthKey.split('-')[0], pv: m.pv };
            }
        });

        // 2. Best Year
        const yearStats = {};
        accOrders.forEach(order => {
            const year = new Date(order.createdAt).getFullYear();
            if (!yearStats[year]) yearStats[year] = { totalRevenue: 0, totalQuantity: 0 };
            yearStats[year].totalRevenue += order.totalAmount;
            yearStats[year].totalQuantity += order.details.length;
        });

        let bestYear = { year: "-", totalRevenue: 0, totalQuantity: 0 };
        Object.keys(yearStats).forEach(year => {
            if (yearStats[year].totalRevenue > bestYear.totalRevenue) {
                bestYear = { year, ...yearStats[year] };
            }
        });

        // 3. Top Buyer
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

        let topBuyer = { name: "Belum ada", category: "-", initial: "-" };
        if (topBuyerId) {
            const customer = await prisma.customer.findUnique({ where: { userId: topBuyerId } });
            if (customer) {
                topBuyer = {
                    name: customer.nama,
                    category: customer.category || "General",
                    initial: customer.nama.substring(0, 3).toUpperCase()
                };
            }
        }

        // 4. New Orders
        const latestOrdersRaw = await prisma.jerseyOrder.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, customerId: true }
        });

        // Wait, wait, JerseyOrder has customerId, but NO customer relation in schema! 
        // We have to fetch customers manually for newOrders.
        const newOrders = [];
        for (const lo of latestOrdersRaw) {
            const customer = await prisma.customer.findUnique({ where: { userId: lo.customerId } });
            if (customer) {
                newOrders.push({ name: customer.nama });
            }
        }

        // Get 5 most recent customers who had any chat activity with admin
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
                    lastMessageContent: msg.content || (msg.attachmentName ? `📎 ${msg.attachmentName}` : (msg.attachmentUrl ? "📎 Lampiran" : "Pesan baru")),
                    category: msg.sender.customer.category || "General Customer"
                });
            }
            if (msg.receiver?.customer && !recentChattersMap.has(msg.receiver.id)) {
                recentChattersMap.set(msg.receiver.id, {
                    id: msg.receiver.id, customerId: msg.receiver.customer.id, nama: msg.receiver.customer.nama,
                    email: msg.receiver.email, lastMessageAt: msg.createdAt,
                    lastMessageContent: msg.content || (msg.attachmentName ? `📎 ${msg.attachmentName}` : (msg.attachmentUrl ? "📎 Lampiran" : "Pesan baru")),
                    category: msg.receiver.customer.category || "General Customer"
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
                lastMessageAt: null, category: c.category || "New Customer"
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
                content: chat.content || (chat.attachmentName ? `📎 ${chat.attachmentName}` : (chat.attachmentUrl ? "📎 Lampiran file" : "")),
                senderName: chat.sender?.customer?.nama || chat.sender?.staff?.nama || chat.sender?.username || "Unknown",
                senderRole: chat.sender?.role,
                createdAt: chat.createdAt,
                isRead: chat.isRead,
                partnerId: partnerId
            };
        });

        const totalUnreadChat = await prisma.message.count({
            where: { isRead: false, receiver: { role: 'admin' } }
        });

        let responseSalesData = { daily: dailySales, monthly: monthlySales, yearly: yearlySales, lifetime: lifetimeSales };

        if (filterYear) {
            if (filterMonth) {
                // Filtered by specific year and month -> Show daily breakdown of that month
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
                // Filtered by specific year -> Show monthly breakdown of that year
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

        res.json({
            code: 200,
            status: "success",
            message: "Dashboard stats fetched successfully",
            data: {
                totalCustomer, totalStaff, totalAdmin, totalRevenue,
                salesData: responseSalesData,
                recentCustomers, recentChats, totalUnreadChat,
                bestMonth, bestYear, topBuyer, newOrders
            }
        });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getAllChatCustomers = async (req, res) => {
    try {
        const chatters = await prisma.user.findMany({
            where: {
                role: 'customer',
                OR: [
                    { sentMessages: { some: {} } },
                    { receivedMessages: { some: {} } }
                ]
            },
            include: { customer: true },
            orderBy: { id: 'desc' }
        });

        res.json({ data: chatters });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getDesigners = async (req, res) => {
    try {
        const designers = await prisma.user.findMany({
            where: { role: 'desain' },
            select: {
                id: true,
                username: true,
                email: true,
                staff: { select: { nama: true } }
            }
        });

        const formatted = designers.map(d => ({
            id: d.id,
            email: d.email,
            nama: d.staff?.nama || d.username
        }));

        res.json({ data: formatted });
    } catch (error) {
        console.error("Error fetching designers:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

module.exports = {
    createCustomer,
    createTeamInternal,
    getUserCountByRole,
    getUsersByRole,
    updateUser,
    deleteUser,
    getUserById,
    getDashboardStats,
    getAllChatCustomers,
    getDesigners
};

const getOmsetReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                gte: new Date(startDate),
                lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const dateWhere = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

        // 1. Total Pemasukan & Breakdown
        const orders = await prisma.jerseyOrder.findMany({
            where: dateWhere,
            include: { details: true }
        });

        let totalPemasukan = 0;
        const revenueBreakdownMap = {};

        orders.forEach(order => {
            // Only include orders that are considered 'laku' (all orders are valid sales in this context, or maybe filter out canceled if any. We will include all as before)
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

        // 2. Total Pengeluaran
        const expenses = await prisma.bahanBajuHistory.aggregate({
            where: {
                aksi: { in: ['BUAT', 'TAMBAH'] },
                ...dateWhere
            },
            _sum: { totalNilai: true }
        });
        const totalPengeluaran = expenses._sum.totalNilai || 0;

        // 3. Keuntungan Bersih
        const netProfit = totalPemasukan - totalPengeluaran;

        // 4. Performa Bahan Baku
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

        res.status(200).json({
            status: "success",
            data: {
                totalPemasukan,
                totalPengeluaran,
                netProfit,
                bahanPerformance,
                revenueBreakdown
            }
        });
    } catch (error) {
        console.error("Error getOmsetReport:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

module.exports.getOmsetReport = getOmsetReport;
