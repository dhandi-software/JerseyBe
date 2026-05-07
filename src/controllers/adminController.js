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
        const [totalCustomer, totalStaff, totalAdmin] = await Promise.all([
            prisma.user.count({ where: { role: 'customer' } }),
            prisma.user.count({ where: { role: { in: ['desain', 'gudang', 'manager'] } } }),
            prisma.user.count({ where: { role: 'admin' } })
        ]);

        console.log("Dashboard Counts:", { totalCustomer, totalStaff, totalAdmin });

        // Calculate Revenue and Transaction Trends
        // 'ACC' orders are those with status NOT in ['MENUNGGU', 'DITOLAK']
        const accOrders = await prisma.jerseyOrder.findMany({
            where: {
                status: { notIn: ['MENUNGGU', 'DITOLAK'] }
            },
            select: {
                totalAmount: true,
                createdAt: true
            }
        });

        const totalRevenue = accOrders.reduce((sum, order) => sum + order.totalAmount, 0);

        // Prepare chart data (Relative time ranges for better visualization)
        const weeklySales = [];
        const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

        // Last 7 Days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            weeklySales.push({ 
                name: dayNames[d.getDay()], 
                pv: 0, 
                dateStr: d.toISOString().split('T')[0] 
            });
        }

        // Last 4 Weeks
        const monthlySales = [
            { name: 'Minggu 1', pv: 0 }, { name: 'Minggu 2', pv: 0 },
            { name: 'Minggu 3', pv: 0 }, { name: 'Minggu 4', pv: 0 }
        ];

        // Last 12 Months
        const yearlySales = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            yearlySales.push({ 
                name: monthNames[d.getMonth()], 
                pv: 0, 
                monthKey: `${d.getFullYear()}-${d.getMonth()}` 
            });
        }

        accOrders.forEach(order => {
            const date = new Date(order.createdAt);
            const dateStr = date.toISOString().split('T')[0];
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            
            // Weekly: match by exact date
            const dayObj = weeklySales.find(d => d.dateStr === dateStr);
            if (dayObj) dayObj.pv += order.totalAmount;

            // Monthly: match by 7-day windows from 'now'
            const diffTime = now.getTime() - date.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 28) {
                const weekIdx = 3 - Math.floor(diffDays / 7);
                if (weekIdx >= 0 && weekIdx < 4) {
                    monthlySales[weekIdx].pv += order.totalAmount;
                }
            }

            // Yearly: match by month and year
            const monthObj = yearlySales.find(m => m.monthKey === monthKey);
            if (monthObj) monthObj.pv += order.totalAmount;
        });

        // Get 5 most recent customers who had any chat activity
        const recentMessages = await prisma.message.findMany({
            where: {
                OR: [
                    { sender: { role: 'customer' } },
                    { receiver: { role: 'customer' } }
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { 
                sender: { include: { customer: true } },
                receiver: { include: { customer: true } }
            }
        });

        const recentChattersMap = new Map();
        recentMessages.forEach(msg => {
            if (msg.sender?.customer && !recentChattersMap.has(msg.sender.id)) {
                recentChattersMap.set(msg.sender.id, {
                    id: msg.sender.id,
                    customerId: msg.sender.customer.id,
                    nama: msg.sender.customer.nama,
                    email: msg.sender.email,
                    lastMessageAt: msg.createdAt,
                    lastMessageContent: msg.content || (msg.attachmentName ? `📎 ${msg.attachmentName}` : (msg.attachmentUrl ? "📎 Lampiran" : "Pesan baru")),
                    category: msg.sender.customer.category || "General Customer"
                });
            }
            if (msg.receiver?.customer && !recentChattersMap.has(msg.receiver.id)) {
                recentChattersMap.set(msg.receiver.id, {
                    id: msg.receiver.id,
                    customerId: msg.receiver.customer.id,
                    nama: msg.receiver.customer.nama,
                    email: msg.receiver.email,
                    lastMessageAt: msg.createdAt,
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
                id: c.user.id,
                customerId: c.id,
                nama: c.nama,
                email: c.user.email,
                lastMessageAt: null,
                category: c.category || "New Customer"
            }))];
        }

        const recentChatsData = await prisma.message.findMany({
            orderBy: { createdAt: 'desc' },
            take: 3,
            include: {
                sender: { 
                    select: { 
                        username: true, 
                        role: true, 
                        customer: { select: { nama: true } }, 
                        staff: { select: { nama: true } } 
                    } 
                }
            }
        });

        const recentChats = recentChatsData.map(chat => ({
            id: chat.id,
            content: chat.content || (chat.attachmentName ? `📎 ${chat.attachmentName}` : (chat.attachmentUrl ? "📎 Lampiran file" : "")),
            senderName: chat.sender?.customer?.nama || chat.sender?.staff?.nama || chat.sender?.username || "Unknown",
            senderRole: chat.sender?.role,
            createdAt: chat.createdAt,
            isRead: chat.isRead
        }));

        const totalUnreadChat = await prisma.message.count({
            where: { isRead: false, receiverId: { not: null } }
        });

        console.log("Dashboard Stats Success - Total Revenue:", totalRevenue);
        res.json({
            code: 200,
            status: "success",
            message: "Dashboard stats fetched successfully",
            data: {
                totalCustomer,
                totalStaff,
                totalAdmin,
                totalRevenue,
                salesData: {
                    weekly: weeklySales,
                    monthly: monthlySales,
                    yearly: yearlySales
                },
                recentCustomers,
                recentChats,
                totalUnreadChat
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
