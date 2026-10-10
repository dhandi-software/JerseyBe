function generateRandomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'JK-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function parseSizeAndSleeve(playerSize) {
    if (!playerSize) return { size: 'L', sleeve: 'Lengan Pendek' };
    const match = playerSize.match(/^([^(]+)(?:\(([^)]+)\))?$/);
    if (match) {
        const size = match[1].trim();
        const sleeve = match[2] ? match[2].trim() : 'Lengan Pendek';
        return { size, sleeve };
    }
    return { size: playerSize.trim() || 'L', sleeve: 'Lengan Pendek' };
}

function getJerseyKgRequirement(size, sleeve) {
    const s = size.toUpperCase().trim();
    const isLongSleeve = sleeve === 'Lengan Panjang';
    const isBigSize = ['3XL', '4XL', '5XL', '6XL', 'XXXL', 'XXXXL'].includes(s);

    if (isLongSleeve) {
        return isBigSize ? 1.0 : 0.5;
    }
    return isBigSize ? 0.5 : (1.0 / 3.0);
}

function getSizeSurcharge(size) {
    const s = size.toUpperCase().trim();
    if (['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL'].includes(s)) {
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
}

function calculateKgFromPcs(pcs, rasioKonversi = 2.5) {
    const rasio = rasioKonversi || 2.5;
    return parseFloat((pcs / rasio).toFixed(4));
}

module.exports = {
    generateRandomId,
    parseSizeAndSleeve,
    getJerseyKgRequirement,
    getSizeSurcharge,
    calculateKgFromPcs
};
