const prisma = require('../config/prisma');

const findAllBahan = async (orderBy = { createdAt: 'desc' }) => {
    return await prisma.bahanBaju.findMany({ orderBy });
};

const findBahanById = async (id) => {
    return await prisma.bahanBaju.findUnique({
        where: { id: parseInt(id) }
    });
};

const findBahanByIds = async (ids) => {
    return await prisma.bahanBaju.findMany({
        where: { id: { in: ids } }
    });
};

const createBahan = async (data) => {
    return await prisma.bahanBaju.create({ data });
};

const updateBahan = async (id, data) => {
    return await prisma.bahanBaju.update({
        where: { id: parseInt(id) },
        data
    });
};

const deleteBahan = async (id) => {
    return await prisma.bahanBaju.delete({
        where: { id: parseInt(id) }
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
    findAllBahan,
    findBahanById,
    findBahanByIds,
    createBahan,
    updateBahan,
    deleteBahan,
    createHistory,
    findHistory
};
