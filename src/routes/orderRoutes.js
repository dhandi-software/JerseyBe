const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const PDFDocument = require('pdfkit-table');

function generateRandomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
    let result = 'JK-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

router.post('/', async (req, res) => {
    try {
        const { customerId, totalAmount, designNote, designUrl, paymentUrl, details } = req.body;
        
        // Generate a unique short order ID
        let orderId = generateRandomId();
        let existing = await prisma.jerseyOrder.findUnique({ where: { orderId } });
        while (existing) {
            orderId = generateRandomId();
            existing = await prisma.jerseyOrder.findUnique({ where: { orderId } });
        }

        const order = await prisma.jerseyOrder.create({
            data: {
                orderId,
                customerId,
                totalAmount,
                designNote,
                designUrl,
                paymentUrl,
                details: {
                    create: details.map(d => ({
                        productId: d.productId,
                        productTitle: d.productTitle,
                        playerName: d.playerName,
                        playerNumber: d.playerNumber,
                        playerSize: d.playerSize
                    }))
                }
            },
            include: {
                details: true
            }
        });

        res.status(201).json(order);
    } catch (error) {
        console.error("Failed to create order:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

router.get('/', async (req, res) => {
    try {
        const orders = await prisma.jerseyOrder.findMany({
            include: {
                details: true,
                designer: { select: { staff: { select: { nama: true } }, username: true } }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Fetch user data to attach customer name
        const userIds = orders.map(o => o.customerId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true }
        });
        
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.username);

        const formattedOrders = orders.map(o => ({
            ...o,
            customerName: userMap[o.customerId] || "Guest User",
            designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : "Belum Ada"
        }));

        res.json(formattedOrders);
    } catch (error) {
        console.error("Failed to fetch orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, designerId } = req.body;

        const currentOrder = await prisma.jerseyOrder.findUnique({
            where: { id: parseInt(id) },
            include: { details: true }
        });

        if (!currentOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        const dataUpdate = { status };
        if (designerId !== undefined) {
            dataUpdate.designerId = designerId;
        }

        // Use transaction to ensure order update and stock reduction are atomic
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.jerseyOrder.update({
                where: { id: parseInt(id) },
                data: dataUpdate
            });

            // Reduce stock only when moving from MENUNGGU to DESAIN
            if (currentOrder.status === 'MENUNGGU' && status === 'DESAIN') {
                const stockToReduce = {};
                currentOrder.details.forEach(detail => {
                    stockToReduce[detail.productId] = (stockToReduce[detail.productId] || 0) + 1;
                });

                for (const [productId, qty] of Object.entries(stockToReduce)) {
                    const idInt = parseInt(productId);
                    const bahan = await tx.bahanBaju.findUnique({ where: { id: idInt } });
                    
                    if (bahan) {
                        await tx.bahanBaju.update({
                            where: { id: idInt },
                            data: {
                                stok: {
                                    decrement: qty
                                }
                            }
                        });

                        // Log history
                        await tx.bahanBajuHistory.create({
                            data: {
                                bahanId: idInt,
                                namaBahan: bahan.nama,
                                aksi: "KURANG",
                                jumlah: qty,
                                stokAkhir: bahan.stok - qty,
                                keterangan: `Stok berkurang otomatis (Order ${currentOrder.orderId} diterima)`
                            }
                        });
                    }
                }
            }
            return updated;
        });

        res.json(result);
    } catch (error) {
        console.error("Failed to update order status:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

router.get('/customer/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const orders = await prisma.jerseyOrder.findMany({
            where: { customerId: parseInt(customerId) },
            include: { details: true, designer: { select: { staff: { select: { nama: true } }, username: true } } },
            orderBy: { createdAt: 'desc' }
        });
        
        const formatted = orders.map(o => ({
            ...o,
            designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : "Belum Ada"
        }));
        res.json(formatted);
    } catch (error) {
        console.error("Failed to fetch customer orders:", error);
        res.status(500).json({ error: "Failed to fetch customer orders" });
    }
});

router.get('/designer/:designerId', async (req, res) => {
    try {
        const { designerId } = req.params;
        const orders = await prisma.jerseyOrder.findMany({
            where: { designerId: parseInt(designerId) },
            include: { details: true, designer: { select: { staff: { select: { nama: true } }, username: true } } },
            orderBy: { createdAt: 'desc' }
        });

        const userIds = orders.map(o => o.customerId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true }
        });
        
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.username);

        const formatted = orders.map(o => ({
            ...o,
            customerName: userMap[o.customerId] || "Guest User",
            designerName: o.designer ? (o.designer.staff?.nama || o.designer.username) : "Belum Ada"
        }));
        res.json(formatted);
    } catch (error) {
        console.error("Failed to fetch designer orders:", error);
        res.status(500).json({ error: "Failed to fetch designer orders" });
    }
});

router.get('/track/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
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
            return res.status(404).json({ error: "Order not found" });
        }

        // Fetch user data to attach customer name
        const user = await prisma.user.findUnique({
            where: { id: order.customerId },
            select: { username: true }
        });

        const formattedOrder = {
            ...order,
            customerName: user ? user.username : "Guest User",
            designerName: order.designer ? (order.designer.staff?.nama || order.designer.username) : "Belum Ada"
        };

        res.json(formattedOrder);
    } catch (error) {
        console.error("Failed to track order:", error);
        res.status(500).json({ error: "Failed to track order" });
    }
});
module.exports = router;
