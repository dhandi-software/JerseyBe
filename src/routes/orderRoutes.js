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
        const { customerId, customerName, customerPhone, totalAmount, designNote, designUrl, paymentUrl, shippingMethod, shippingAddress, details } = req.body;
        
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
                customerName,
                customerPhone,
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
            isAdminOrder: !!o.customerName, // true only if admin manually set customerName (offline order)
            customerName: o.customerName || userMap[o.customerId] || "Guest User",
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
                const parseSizeAndSleeve = (playerSize) => {
                    if (!playerSize) return { size: "L", sleeve: "Lengan Pendek" };
                    const match = playerSize.match(/^([^(]+)(?:\(([^)]+)\))?$/);
                    if (match) {
                        const size = match[1].trim();
                        const sleeve = match[2] ? match[2].trim() : "Lengan Pendek";
                        return { size, sleeve };
                    }
                    return { size: playerSize.trim() || "L", sleeve: "Lengan Pendek" };
                };

                const getJerseyKgRequirement = (size, sleeve) => {
                    const s = size.toUpperCase().trim();
                    const isLongSleeve = sleeve === "Lengan Panjang";
                    const isBigSize = ["3XL", "4XL", "5XL", "6XL", "XXXL", "XXXXL"].includes(s);

                    if (isLongSleeve) {
                        return isBigSize ? 1.0 : 0.5;
                    } else {
                        return isBigSize ? 0.5 : (1.0 / 3.0);
                    }
                };

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
                    const isLongSleeve = sleeve === "Lengan Panjang";
                    const isBigSize = ["3XL", "4XL", "5XL", "6XL", "XXXL", "XXXXL"].includes(s);

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
                        const newStatus = newKuantitas <= 0 ? "Habis" : bahan.status;

                        await tx.bahanBaju.update({
                            where: { id: idInt },
                            data: {
                                kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                                status: newStatus
                            }
                        });

                        // Log history
                        await tx.bahanBajuHistory.create({
                            data: {
                                bahanId: idInt,
                                namaBahan: bahan.nama,
                                aksi: "KURANG",
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
            customerName: o.customerName || (user ? (user.customer?.nama || user.username) : "Guest User"),
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
            customerName: o.customerName || userMap[o.customerId] || "Guest User",
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

// Update payment URL for admin upload
router.patch('/:id/payment', async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentUrl } = req.body;
        
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: { paymentUrl }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to update payment URL:", error);
        res.status(500).json({ error: "Failed to update payment URL" });
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

// Upload layout mockup for an order
router.post('/:id/layout', upload.single('layout'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        
        const layoutUrl = `/uploads/${req.file.filename}`;
        
        const updatedOrder = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                layoutUrl,
                layoutStatus: "SENT"
            }
        });
        
        res.json(updatedOrder);
    } catch (error) {
        console.error("Failed to upload layout:", error);
        res.status(500).json({ error: "Failed to upload layout" });
    }
});

// Approve layout mockup
router.patch('/:id/approve-layout', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                layoutStatus: "APPROVED",
                layoutFeedback: null
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to approve layout:", error);
        res.status(500).json({ error: "Failed to approve layout" });
    }
});

// Reject/Revisi layout mockup
router.patch('/:id/revisi-layout', async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        if (!feedback) {
            return res.status(400).json({ error: "Feedback is required for revision" });
        }
        
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                layoutStatus: "REVISI",
                layoutFeedback: feedback
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to submit layout revision:", error);
        res.status(500).json({ error: "Failed to submit layout revision" });
    }
});

// Cancel/Retract layout mockup
router.patch('/:id/cancel-layout', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                layoutUrl: null,
                layoutStatus: "PENDING"
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to cancel layout:", error);
        res.status(500).json({ error: "Failed to cancel layout" });
    }
});


// Recommend alternative materials for an order
router.patch('/:id/recommend-alternatives', async (req, res) => {
    try {
        const { id } = req.params;
        const { recommendedBahanIds } = req.body;
        
        const updated = await prisma.jerseyOrder.update({
            where: { id: parseInt(id) },
            data: {
                recommendedBahanIds: recommendedBahanIds || []
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Failed to recommend alternatives:", error);
        res.status(500).json({ error: "Failed to recommend alternatives" });
    }
});

// Customer selects an alternative material for an order
router.patch('/:id/select-alternative', async (req, res) => {
    try {
        const { id } = req.params;
        const { selectedBahanId } = req.body;
        
        const order = await prisma.jerseyOrder.findUnique({
            where: { id: parseInt(id) },
            include: { details: true }
        });
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        const selectedBahan = await prisma.bahanBaju.findUnique({
            where: { id: selectedBahanId }
        });
        
        if (!selectedBahan) {
            return res.status(404).json({ error: "Selected material not found" });
        }
        
        const getSizeSurcharge = (size) => {
            const s = size.toUpperCase().trim();
            if (["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL"].includes(s)) {
                return 0;
            }
            const numXlMatch = s.match(/^(\d+)XL$/);
            if (numXlMatch) {
                const xCount = parseInt(numXlMatch[1], 10);
                if (xCount >= 3) {
                    return (xCount - 2) * 10000;
                }
            }
            const xMatches = s.match(/^(X+)L$/);
            if (xMatches) {
                const xCount = xMatches[1].length;
                if (xCount >= 3) {
                    return (xCount - 2) * 10000;
                }
            }
            return 0;
        };

        const updatedOrder = await prisma.$transaction(async (tx) => {
            // Update all order details with the new material
            await tx.jerseyOrderDetail.updateMany({
                where: { orderId: parseInt(id) },
                data: {
                    productId: selectedBahan.id,
                    productTitle: selectedBahan.nama
                }
            });
            
            // Recalculate totalAmount (sum of base price + size surcharge per player)
            const basePrice = selectedBahan.harga || 150000;
            let newTotal = 0;
            order.details.forEach(detail => {
                let size = "L";
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
                where: { id: parseInt(id) },
                data: {
                    recommendedBahanIds: [],
                    totalAmount: newTotal
                },
                include: {
                    details: true
                }
            });
        });
        
        res.json(updatedOrder);
    } catch (error) {
        console.error("Failed to select alternative material:", error);
        res.status(500).json({ error: "Failed to select alternative material" });
    }
});

// Report damaged items for an order
router.post('/:id/damage', async (req, res) => {
    try {
        const { id } = req.params;
        const { productId, pcs, keterangan } = req.body;
        
        if (!productId || !pcs || pcs <= 0) {
            return res.status(400).json({ error: "Product ID and valid Pcs are required" });
        }
        
        const order = await prisma.jerseyOrder.findUnique({
            where: { id: parseInt(id) },
            include: { details: true }
        });
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        const user = await prisma.user.findUnique({
            where: { id: order.customerId },
            select: { username: true, customer: { select: { nama: true } } }
        });
        const customerName = order.customerName || user?.customer?.nama || user?.username || 'Customer';
        
        const bahan = await prisma.bahanBaju.findUnique({
            where: { id: parseInt(productId) }
        });
        
        if (!bahan) {
            return res.status(404).json({ error: "Material not found" });
        }
        
        // Calculate kg requirement from pcs using rasioKonversi
        const rasio = bahan.rasioKonversi || 2.5;
        // In previous logic: kgReq = meterReq / rasio. 
        // For simplicity, we just assume: 1 pcs = (1 / rasio) kg, or we can just use 1 kg = rasio pcs. 
        // So kg = pcs / rasio
        const kgToDecrement = parseFloat((pcs / rasio).toFixed(4));
        
        const updatedOrder = await prisma.$transaction(async (tx) => {
            // Deduct stock
            const newKuantitas = Math.max(0, bahan.kuantitasKg - kgToDecrement);
            const newStatus = newKuantitas <= 0 ? "Habis" : bahan.status;
            
            await tx.bahanBaju.update({
                where: { id: bahan.id },
                data: {
                    kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                    status: newStatus
                }
            });
            
            // Record history
            await tx.bahanBajuHistory.create({
                data: {
                    bahanId: bahan.id,
                    namaBahan: bahan.nama,
                    aksi: "RUSAK",
                    jumlah: kgToDecrement,
                    stokAkhir: parseFloat(newKuantitas.toFixed(4)),
                    keterangan: keterangan 
                        ? `Kerusakan menjahit - ${keterangan}` 
                        : `Kerusakan menjahit`,
                    actor: req.body.actor || "System/Admin",
                    customerName: customerName,
                    pcs: parseInt(pcs),
                    orderId: parseInt(id)
                }
            });
            
            // Update order damagedPcs
            return await tx.jerseyOrder.update({
                where: { id: parseInt(id) },
                data: {
                    damagedPcs: (order.damagedPcs || 0) + parseInt(pcs)
                },
                include: {
                    details: true
                }
            });
        });
        
        res.json(updatedOrder);
    } catch (error) {
        console.error("Failed to report damage:", error);
        res.status(500).json({ error: "Failed to report damage" });
    }
});

router.put('/damage/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const { pcs, keterangan, actor } = req.body;

        if (!pcs || pcs <= 0) {
            return res.status(400).json({ error: "Valid Pcs is required" });
        }

        const history = await prisma.bahanBajuHistory.findUnique({
            where: { id: parseInt(historyId) },
            include: { bahan: true }
        });

        if (!history || history.aksi !== 'RUSAK' || !history.orderId) {
            return res.status(404).json({ error: "Damage history not found or invalid" });
        }

        const bahan = history.bahan;
        if (!bahan) {
            return res.status(404).json({ error: "Associated material not found" });
        }

        const oldPcs = history.pcs || 0;
        const newPcs = parseInt(pcs);
        const diffPcs = newPcs - oldPcs;

        const rasio = bahan.rasioKonversi || 2.5;
        const oldKg = history.jumlah;
        const newKg = parseFloat((newPcs / rasio).toFixed(4));
        const diffKg = newKg - oldKg; // positive means we need more kg (more damage)

        const result = await prisma.$transaction(async (tx) => {
            // Apply stock diff
            const currentKuantitas = bahan.kuantitasKg;
            const newKuantitas = Math.max(0, currentKuantitas - diffKg);
            const newStatus = newKuantitas <= 0 ? "Habis" : "Tersedia";

            await tx.bahanBaju.update({
                where: { id: bahan.id },
                data: {
                    kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
                    status: newStatus
                }
            });

            // Update history
            const newKeteranganText = keterangan 
                ? `Kerusakan menjahit - ${keterangan}` 
                : `Kerusakan menjahit`;

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

            // Update order damagedPcs
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

        res.json(result);
    } catch (error) {
        console.error("Failed to update damage report:", error);
        res.status(500).json({ error: "Failed to update damage report" });
    }
});

router.get('/:id/damage-history', async (req, res) => {
    try {
        const { id } = req.params;
        const histories = await prisma.bahanBajuHistory.findMany({
            where: { orderId: parseInt(id), aksi: 'RUSAK' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(histories);
    } catch (error) {
        console.error("Failed to fetch damage history:", error);
        res.status(500).json({ error: "Failed to fetch damage history" });
    }
});

module.exports = router;
