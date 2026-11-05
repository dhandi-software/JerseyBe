const orderRepository = require('../../repositories/orderRepository');
const bahanBajuRepository = require('../../repositories/bahanBajuRepository');
const userRepository = require('../../repositories/userRepository');

/**
 * Record sewing/production fabric damage, convert pcs to kg via conversion ratio,
 * decrement inventory stock, and log damage history.
 */
const recordDamage = async (id, { productId, pcs, keterangan, actor }) => {
    const orderIdInt = parseInt(id, 10);
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

    const user = await userRepository.findUserById(order.customerId, {
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

    return await orderRepository.runTransaction(async (tx) => {
        const newKuantitas = Math.max(0, bahan.kuantitasKg - kgToDecrement);
        const newStatus = newKuantitas <= 0 ? 'Habis' : bahan.status;

        await bahanBajuRepository.updateBahan(bahan.id, {
            kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
            status: newStatus
        }, tx);

        await bahanBajuRepository.createHistory({
            bahanId: bahan.id,
            namaBahan: bahan.nama,
            aksi: 'RUSAK',
            jumlah: kgToDecrement,
            stokAkhir: parseFloat(newKuantitas.toFixed(4)),
            keterangan: keterangan ? `Kerusakan menjahit - ${keterangan}` : 'Kerusakan menjahit',
            actor: actor || 'System/Admin',
            customerName,
            pcs: parseInt(pcs, 10),
            orderId: orderIdInt
        }, tx);

        return await orderRepository.updateOrder(orderIdInt, {
            damagedPcs: (order.damagedPcs || 0) + parseInt(pcs, 10)
        }, {
            details: true
        }, tx);
    });
};

/**
 * Update an existing damage record, compute delta kg and pcs,
 * adjust fabric stock, and update order damagedPcs.
 */
const updateDamage = async (historyId, { pcs, keterangan, actor }) => {
    if (!pcs || pcs <= 0) {
        const error = new Error('Valid Pcs is required');
        error.statusCode = 400;
        throw error;
    }

    const history = await bahanBajuRepository.findHistoryById(parseInt(historyId, 10), { bahan: true });

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
    const newPcs = parseInt(pcs, 10);
    const diffPcs = newPcs - oldPcs;

    const rasio = bahan.rasioKonversi || 2.5;
    const oldKg = history.jumlah;
    const newKg = parseFloat((newPcs / rasio).toFixed(4));
    const diffKg = newKg - oldKg;

    return await orderRepository.runTransaction(async (tx) => {
        const currentKuantitas = bahan.kuantitasKg;
        const newKuantitas = Math.max(0, currentKuantitas - diffKg);
        const newStatus = newKuantitas <= 0 ? 'Habis' : 'Tersedia';

        await bahanBajuRepository.updateBahan(bahan.id, {
            kuantitasKg: parseFloat(newKuantitas.toFixed(4)),
            status: newStatus
        }, tx);

        const newKeteranganText = keterangan ? `Kerusakan menjahit - ${keterangan}` : 'Kerusakan menjahit';

        const updatedHistory = await bahanBajuRepository.updateHistory(parseInt(historyId, 10), {
            pcs: newPcs,
            jumlah: newKg,
            keterangan: newKeteranganText,
            stokAkhir: parseFloat(newKuantitas.toFixed(4)),
            actor: actor || history.actor
        }, tx);

        const order = await orderRepository.findOrderById(history.orderId, null, tx);

        if (order) {
            await orderRepository.updateOrder(order.id, {
                damagedPcs: Math.max(0, (order.damagedPcs || 0) + diffPcs)
            }, null, tx);
        }

        return updatedHistory;
    });
};

/**
 * Retrieve all damage history records for an order.
 */
const getDamageHistory = async (id) => {
    return await bahanBajuRepository.findHistory(
        { orderId: parseInt(id, 10), aksi: 'RUSAK' },
        null,
        { createdAt: 'desc' }
    );
};

module.exports = {
    recordDamage,
    updateDamage,
    getDamageHistory
};
