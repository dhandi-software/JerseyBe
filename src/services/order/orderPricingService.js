const bahanBajuRepository = require('../../repositories/bahanBajuRepository');
const {
    parseSizeAndSleeve,
    getSizeSurcharge
} = require('../../utils/orderUtils');

/**
 * Authoritative price calculation engine for orders:
 * Resolves material price from options/catalog fallback, applies size surcharges (3XL+),
 * computes subtotal, discounts, and final total amount.
 *
 * @param {Array} details - Array of order details
 * @param {Object|number} options - Price options object or raw numeric materialPrice
 * @returns {Promise<Object>} Calculation result object with valueOf helper
 */
const calculateAuthoritativeOrderTotal = async (details = [], options = {}) => {
    let materialPrice = null;
    let discount = 0;
    let materialId = null;
    let materialName = null;

    if (typeof options === 'object' && options !== null) {
        materialPrice = options.materialPrice;
        discount = options.discount;
        materialId = options.materialId;
        materialName = options.materialName;
    } else if (typeof options === 'number') {
        materialPrice = options;
        discount = arguments[2] || 0;
    }

    const safeDetails = Array.isArray(details) ? details : [];

    let catalogPrice = null;
    const targetMaterialId = materialId || safeDetails.find(d => d.productId)?.productId;
    if (targetMaterialId) {
        const idInt = parseInt(targetMaterialId, 10);
        if (!isNaN(idInt) && idInt > 0) {
            const dbBahan = await bahanBajuRepository.findBahanById(idInt);
            if (dbBahan) {
                catalogPrice = Number(dbBahan.harga);
                if (!materialName) materialName = dbBahan.nama;
            }
        }
    }

    let baseUnitPrice = 150000;
    if (materialPrice !== null && materialPrice !== undefined && !isNaN(Number(materialPrice)) && Number(materialPrice) > 0) {
        baseUnitPrice = Number(materialPrice);
    } else if (catalogPrice !== null && !isNaN(catalogPrice) && catalogPrice > 0) {
        baseUnitPrice = catalogPrice;
    }

    const detailsWithPrices = safeDetails.map(detail => {
        const { size } = parseSizeAndSleeve(detail.playerSize || 'L');
        const surcharge = getSizeSurcharge(size);
        const unitPrice = baseUnitPrice + surcharge;
        return {
            ...detail,
            unitPrice
        };
    });

    const subtotalAmount = detailsWithPrices.reduce((sum, d) => sum + d.unitPrice, 0);
    const cleanDiscount = Math.max(0, Number(discount) || 0);
    const totalAmount = Math.max(0, subtotalAmount - cleanDiscount);

    return {
        subtotalAmount,
        discount: cleanDiscount,
        totalAmount,
        materialPrice: baseUnitPrice,
        materialId: materialId ? parseInt(materialId, 10) : null,
        materialName: materialName ? String(materialName).trim() : null,
        detailsWithPrices,
        valueOf: () => totalAmount
    };
};

module.exports = {
    calculateAuthoritativeOrderTotal
};
