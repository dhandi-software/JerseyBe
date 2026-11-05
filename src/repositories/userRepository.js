const prisma = require('../config/prisma');

const findUserById = async (id, options = { customer: true, staff: true }, tx = prisma) => {
    const query = {
        where: { id: parseInt(id, 10) }
    };
    if (options && options.select) {
        query.select = options.select;
    } else if (options && options.include) {
        query.include = options.include;
    } else if (options) {
        query.include = options;
    }
    return await tx.user.findUnique(query);
};

const findUserByEmail = async (email, tx = prisma) => {
    if (typeof email !== 'string' || !email.trim()) {
        return null;
    }
    return await tx.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        include: {
            customer: true,
            staff: true
        }
    });
};

const findUserByIdentifier = async (identifier, tx = prisma) => {
    if (typeof identifier !== 'string' || !identifier.trim()) {
        return null;
    }
    const clean = identifier.trim();
    return await tx.user.findFirst({
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

const findUsers = async (where = {}, select = null, orderBy = null, tx = prisma) => {
    const query = { where };
    if (select) query.select = select;
    if (orderBy) query.orderBy = orderBy;
    return await tx.user.findMany(query);
};

const countUsers = async (where = {}, tx = prisma) => {
    return await tx.user.count({ where });
};

const createUser = async (data, tx = prisma) => {
    return await tx.user.create({ data });
};

const updateUser = async (id, data, include = null, tx = prisma) => {
    const query = {
        where: { id: parseInt(id, 10) },
        data
    };
    if (include) query.include = include;
    return await tx.user.update(query);
};

const deleteUser = async (id, tx = prisma) => {
    return await tx.user.delete({
        where: { id: parseInt(id, 10) }
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

        const { password: _, ...safeUser } = user;
        return { user: safeUser, customer };
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

        const { password: _, ...safeUser } = user;
        return { user: safeUser, staff };
    });
};

const updateProfileWithTransaction = async (userId, userUpdateData, profileUpdateData) => {
    return await prisma.$transaction(async (tx) => {
        if (Object.keys(userUpdateData).length > 0) {
            await tx.user.update({
                where: { id: parseInt(userId, 10) },
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

const findCustomerUserIdsByQuery = async (queryText, tx = prisma) => {
    if (!queryText || !queryText.trim()) return [];
    const clean = queryText.trim();
    const users = await tx.user.findMany({
        where: {
            OR: [
                { username: { contains: clean, mode: 'insensitive' } },
                { customer: { nama: { contains: clean, mode: 'insensitive' } } }
            ]
        },
        select: { id: true }
    });
    return users.map(u => u.id);
};

const findUsersByIds = async (ids, select = null, tx = prisma) => {
    const query = {
        where: { id: { in: ids } }
    };
    if (select) query.select = select;
    return await tx.user.findMany(query);
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
    updateProfileWithTransaction,
    findCustomerUserIdsByQuery,
    findUsersByIds
};
