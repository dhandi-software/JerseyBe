const orderRepository = require('../../repositories/orderRepository');
const bahanBajuRepository = require('../../repositories/bahanBajuRepository');
const { getSizeSurcharge } = require('../../utils/orderUtils');

/**
 * Recommend out-of-stock alternative fabric IDs for an order.
 */
const recommendAlternatives = async (id, recommendedBahanIds) => {
    return await orderRepository.updateOrder(id, {
        recommendedBahanIds: recommendedBahanIds || []
    });
};

/**
 * Select alternative fabric, update player items product info,
 * and recalculate total with size surcharges.
 */
const selectAlternative = async (id, selectedBahanId) => {
    const orderIdInt = parseInt(id, 10);
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

    return await orderRepository.runTransaction(async (tx) => {
        await orderRepository.updateManyOrderDetails(orderIdInt, {
            productId: selectedBahan.id,
            productTitle: selectedBahan.nama
        }, tx);

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

        return await orderRepository.updateOrder(orderIdInt, {
            recommendedBahanIds: [],
            totalAmount: newTotal
        }, {
            details: true
        }, tx);
    });
};

/**
 * Update video demonstration URL, admin notes, and design notes.
 */
const updateVideoNotes = async (id, { videoUrl, adminNote, designNote }) => {
    const orderIdInt = parseInt(id, 10);
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
    recommendAlternatives,
    selectAlternative,
    updateVideoNotes
};
