const prisma = require('../config/prisma');

const findUserById = async (id, include = { customer: true, staff: true }) => {
    return await prisma.user.findUnique({
        where: { id: parseInt(id) },
        include
    });
};

const findUserByEmail = async (email) => {
    if (typeof email !== 'string' || !email.trim()) {
        return null;
    }
    return await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        include: {
            customer: true,
            staff: true
        }
    });
};

const findUserByIdentifier = async (identifier) => {
    if (typeof identifier !== 'string' || !identifier.trim()) {
        return null;
    }
    const clean = identifier.trim();
    return await prisma.user.findFirst({
        where: {
            OR: [
                { username: { equals: clean, mode: 'insensitive' } },
                { email: { equals: clean, mode: 'insensitive' } }
            ]
        },
        include: {
            customer: true,
            staff: true
        }
    });
};

const findUsers = async (where = {}, select = null, orderBy = null) => {
    const query = { where };
    if (select) query.select = select;
    if (orderBy) query.orderBy = orderBy;
    return await prisma.user.findMany(query);
};

const countUsers = async (where = {}) => {
    return await prisma.user.count({ where });
};

const createUser = async (data) => {
    return await prisma.user.create({ data });
};

const updateUser = async (id, data, include = null) => {
    const query = {
        where: { id: parseInt(id) },
        data
    };
    if (include) query.include = include;
    return await prisma.user.update(query);
};

const deleteUser = async (id) => {
    return await prisma.user.delete({
        where: { id: parseInt(id) }
    });
};

const createCustomerWithTransaction = async ({ username, email, password, nama }) => {
    return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                username,
                email,
                password,
                role: 'customer'
            }
        });

        const customer = await tx.customer.create({
            data: {
                userId: user.id,
                nama
            }
        });

        return { user, customer };
    });
};

const createStaffWithTransaction = async ({ username, email, password, role, nama }) => {
    return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                username,
                email,
                password,
                role
            }
        });

        const staff = await tx.staff.create({
            data: {
                userId: user.id,
                nama
            }
        });

        return { user, staff };
    });
};

const updateProfileWithTransaction = async (userId, userUpdateData, profileUpdateData) => {
    return await prisma.$transaction(async (tx) => {
        if (Object.keys(userUpdateData).length > 0) {
            await tx.user.update({
                where: { id: parseInt(userId) },
                data: userUpdateData
            });
        }

        if (profileUpdateData.name) {
            if (profileUpdateData.customer) {
                await tx.customer.update({
                    where: { id: profileUpdateData.customer.id },
                    data: { nama: profileUpdateData.name }
                });
            } else if (profileUpdateData.staff) {
                await tx.staff.update({
                    where: { id: profileUpdateData.staff.id },
                    data: { nama: profileUpdateData.name }
                });
            }
        }
    });
};

module.exports = {
    findUserById,
    findUserByEmail,
    findUserByIdentifier,
    findUsers,
    countUsers,
    createUser,
    updateUser,
    deleteUser,
    createCustomerWithTransaction,
    createStaffWithTransaction,
    updateProfileWithTransaction
};
