const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const PDFDocument = require('pdfkit-table');
const upload = require('../middleware/upload');

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
        const { customerId, totalAmount, designNote, designUrl, paymentUrl, shippingMethod, shippingAddress, details } = req.body;
        
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
                shippingMethod: shippingMethod || "PICKUP",
                shippingAddress: shippingMethod === "COD" ? shippingAddress : null,
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
            select: { 
                id: true, 
                username: true,
                customer: { select: { nama: true } }
            }
        });
        
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.customer?.nama || u.username);

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
        const { status, designerId, isWorking } = req.body;

        const currentOrder = await prisma.jerseyOrder.findUnique({
            where: { id: parseInt(id) },
            include: { details: true }
        });

        if (!currentOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        const dataUpdate = {};
        if (status !== undefined) {
            dataUpdate.status = status;
        }
        if (designerId !== undefined) {
            dataUpdate.designerId = designerId;
        }
        if (isWorking !== undefined) {
            dataUpdate.isWorking = isWorking;
        }

        // Use transaction to ensure order update and stock reduction are atomic
        const result = await prisma.$transaction(async (tx) => {
            // Generate sequential queue number if status is DESAIN and order doesn't have one
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
        
        // Fetch user data to attach customer name
        const user = await prisma.user.findUnique({
            where: { id: parseInt(customerId) },
            select: { 
                username: true,
                customer: { select: { nama: true } }
            }
        });

        const formatted = orders.map(o => ({
            ...o,
            customerName: user ? (user.customer?.nama || user.username) : "Guest User",
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
            select: { 
                id: true, 
                username: true,
                customer: { select: { nama: true } }
            }
        });
        
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.customer?.nama || u.username);

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
            select: { 
                username: true,
                customer: { select: { nama: true } }
            }
        });

        const formattedOrder = {
            ...order,
            customerName: user ? (user.customer?.nama || user.username) : "Guest User",
            designerName: order.designer ? (order.designer.staff?.nama || order.designer.username) : "Belum Ada"
        };

        res.json(formattedOrder);
    } catch (error) {
        console.error("Failed to track order:", error);
        res.status(500).json({ error: "Failed to track order" });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { totalAmount, designNote, designUrl, paymentUrl, shippingMethod, shippingAddress, details } = req.body;

        const currentOrder = await prisma.jerseyOrder.findUnique({
            where: { id: parseInt(id) }
        });

        if (!currentOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (currentOrder.status !== 'MENUNGGU') {
            return res.status(400).json({ error: "Pesanan yang sudah di-acc tidak dapat diedit." });
        }

        const updatedOrder = await prisma.$transaction(async (tx) => {
            // Delete old details
            await tx.jerseyOrderDetail.deleteMany({
                where: { orderId: parseInt(id) }
            });

            // Update order and recreate details
            return await tx.jerseyOrder.update({
                where: { id: parseInt(id) },
                data: {
                    totalAmount,
                    designNote,
                    designUrl,
                    paymentUrl,
                    shippingMethod: shippingMethod !== undefined ? shippingMethod : currentOrder.shippingMethod,
                    shippingAddress: shippingMethod !== undefined ? (shippingMethod === "COD" ? shippingAddress : null) : currentOrder.shippingAddress,
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
        });

        res.json(updatedOrder);
    } catch (error) {
        console.error("Failed to edit order:", error);
        res.status(500).json({ error: "Failed to edit order" });
    }
});

// Upload mockup design for an order
router.post('/:id/mockup', upload.single('mockup'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        
        const mockupUrl = `/uploads/${req.file.filename}`;
        
        const updatedOrder = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                mockupUrl,
                designStatus: "SENT"
            }
        });
        
        res.json(updatedOrder);
    } catch (error) {
        console.error("Failed to upload mockup:", error);
        res.status(500).json({ error: "Failed to upload mockup" });
    }
});

// Approve design mockup
router.patch('/:id/approve-design', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                designStatus: "APPROVED",
                designFeedback: null
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to approve design:", error);
        res.status(500).json({ error: "Failed to approve design" });
    }
});

// Reject/Revisi design mockup
router.patch('/:id/revisi-design', async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        if (!feedback) {
            return res.status(400).json({ error: "Feedback is required for revision" });
        }
        
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                designStatus: "REVISI",
                designFeedback: feedback
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to submit design revision:", error);
        res.status(500).json({ error: "Failed to submit design revision" });
    }
});

// Cancel/Retract design mockup
router.patch('/:id/cancel-mockup', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                mockupUrl: null,
                designStatus: "PENDING"
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to cancel mockup:", error);
        res.status(500).json({ error: "Failed to cancel mockup" });
    }
});

module.exports = router;
