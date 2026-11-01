const prisma = require('../config/prisma');

function generateBahanUuid(id, existingUuid) {
    if (existingUuid && typeof existingUuid === 'string' && existingUuid.length >= 8) {
        return existingUuid;
    }
    const str = `fcsv-bahan-baju-v1-${id}`;
    const hash32 = (seed) => {
        let h = seed >>> 0;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
            h = (h ^ (h >>> 13)) >>> 0;
        }
        h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d);
        return (h ^ (h >>> 15)) >>> 0;
    };
    const p1 = hash32(0x9747b28c).toString(16).padStart(8, '0');
    const p2 = hash32(0x85ebca6b).toString(16).padStart(8, '0');
    const p3 = hash32(0xc2b2ae35).toString(16).padStart(8, '0');
    const p4 = hash32(0x27d4eb2f).toString(16).padStart(8, '0');

    const timeLow = p1;
    const timeMid = p2.slice(0, 4);
    const timeHiAndVersion = '4' + p2.slice(5, 8);
    const variantNibble = ((parseInt(p3[0], 16) & 0x3) | 0x8).toString(16);
    const clockSeq = variantNibble + p3.slice(1, 4);
    const node = p3.slice(4, 8) + p4;
    return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeq}-${node}`;
}

function withUuid(bahan) {
    if (!bahan) return null;
    return {
        ...bahan,
        uuid: generateBahanUuid(bahan.id, bahan.uuid),
    };
}

const findAllBahan = async (orderBy = { createdAt: 'desc' }) => {
    const rows = await prisma.bahanBaju.findMany({ orderBy });
    return rows.map(withUuid);
};

const findBahanById = async (idOrUuid) => {
    const raw = String(idOrUuid || '').trim();
    if (/^\d+$/.test(raw)) {
        const found = await prisma.bahanBaju.findUnique({
            where: { id: parseInt(raw, 10) }
        });
        return withUuid(found);
    }

    const all = await prisma.bahanBaju.findMany();
    const matched = all.find((b) => generateBahanUuid(b.id, b.uuid) === raw);
    return withUuid(matched || null);
};

const findBahanByIds = async (ids) => {
    const rows = await prisma.bahanBaju.findMany({
        where: { id: { in: ids } }
    });
    return rows.map(withUuid);
};

const createBahan = async (data) => {
    const created = await prisma.bahanBaju.create({ data });
    return withUuid(created);
};

const updateBahan = async (idOrUuid, data) => {
    let targetId = parseInt(idOrUuid, 10);
    if (!/^\d+$/.test(String(idOrUuid || '').trim())) {
        const existing = await findBahanById(idOrUuid);
        if (!existing) {
            const err = new Error('Not found');
            err.statusCode = 404;
            throw err;
        }
        targetId = existing.id;
    }

    const updated = await prisma.bahanBaju.update({
        where: { id: targetId },
        data
    });
    return withUuid(updated);
};

const deleteBahan = async (idOrUuid) => {
    let targetId = parseInt(idOrUuid, 10);
    if (!/^\d+$/.test(String(idOrUuid || '').trim())) {
        const existing = await findBahanById(idOrUuid);
        if (!existing) {
            const err = new Error('Not found');
            err.statusCode = 404;
            throw err;
        }
        targetId = existing.id;
    }

    return await prisma.bahanBaju.delete({
        where: { id: targetId }
    });
};

const createHistory = async (data) => {
    return await prisma.bahanBajuHistory.create({ data });
};

const findHistory = async (where = {}, include = { bahan: true }, orderBy = { createdAt: 'desc' }) => {
    return await prisma.bahanBajuHistory.findMany({
        where,
        include,
        orderBy
    });
};

module.exports = {
    generateBahanUuid,
    findAllBahan,
    findBahanById,
    findBahanByIds,
    createBahan,
    updateBahan,
    deleteBahan,
    createHistory,
    findHistory
};
