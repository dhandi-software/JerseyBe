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

const findAllBahan = async (orderBy = { createdAt: 'desc' }, tx = prisma) => {
    const rows = await tx.bahanBaju.findMany({ orderBy });
    return rows.map(withUuid);
};

const findBahanById = async (idOrUuid, tx = prisma) => {
    const raw = String(idOrUuid || '').trim();
    if (/^\d+$/.test(raw)) {
        const found = await tx.bahanBaju.findUnique({
            where: { id: parseInt(raw, 10) }
        });
        return withUuid(found);
    }

    const all = await tx.bahanBaju.findMany();
    const matched = all.find((b) => generateBahanUuid(b.id, b.uuid) === raw);
    return withUuid(matched || null);
};

const findBahanByIds = async (ids, tx = prisma) => {
    const rows = await tx.bahanBaju.findMany({
        where: { id: { in: ids } }
    });
    return rows.map(withUuid);
};

const createBahan = async (data, tx = prisma) => {
    const created = await tx.bahanBaju.create({ data });
    return withUuid(created);
};

const updateBahan = async (idOrUuid, data, tx = prisma) => {
    let targetId = parseInt(idOrUuid, 10);
    if (!/^\d+$/.test(String(idOrUuid || '').trim())) {
        const existing = await findBahanById(idOrUuid, tx);
        if (!existing) {
            const err = new Error('Not found');
            err.statusCode = 404;
            throw err;
        }
        targetId = existing.id;
    }

    const updated = await tx.bahanBaju.update({
        where: { id: targetId },
        data
    });
    return withUuid(updated);
};

const deleteBahan = async (idOrUuid, tx = prisma) => {
    let targetId = parseInt(idOrUuid, 10);
    if (!/^\d+$/.test(String(idOrUuid || '').trim())) {
        const existing = await findBahanById(idOrUuid, tx);
        if (!existing) {
            const err = new Error('Not found');
            err.statusCode = 404;
            throw err;
        }
        targetId = existing.id;
    }

    return await tx.bahanBaju.delete({
        where: { id: targetId }
    });
};

const createHistory = async (data, tx = prisma) => {
    return await tx.bahanBajuHistory.create({ data });
};

const findHistory = async (where = {}, include = { bahan: true }, orderBy = { createdAt: 'desc' }, tx = prisma) => {
    const query = { where, orderBy };
    if (include) query.include = include;
    return await tx.bahanBajuHistory.findMany(query);
};

const findHistoryById = async (id, include = { bahan: true }, tx = prisma) => {
    const query = {
        where: { id: parseInt(id, 10) }
    };
    if (include) query.include = include;
    return await tx.bahanBajuHistory.findUnique(query);
};

const updateHistory = async (id, data, tx = prisma) => {
    return await tx.bahanBajuHistory.update({
        where: { id: parseInt(id, 10) },
        data
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
    findHistory,
    findHistoryById,
    updateHistory
};
