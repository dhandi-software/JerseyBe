const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const userRepository = require('../repositories/userRepository');

const getProfile = async (id) => {
    const user = await userRepository.findUserById(id);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const name = user.customer?.nama || user.staff?.nama || user.username;

    return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name,
        photo: user.photo,
        bio: user.bio,
        customer: user.customer,
        staff: user.staff
    };
};

const updateProfile = async (id, { name, bio, photoUrl }) => {
    const user = await userRepository.findUserById(id);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const updateData = {};
    if (bio !== undefined) updateData.bio = bio;
    if (photoUrl !== undefined) updateData.photo = photoUrl;

    await userRepository.updateProfileWithTransaction(id, updateData, {
        name,
        customer: user.customer,
        staff: user.staff
    });

    return { message: 'Profile updated successfully' };
};

const createCustomer = async ({ email, password, nama }) => {
    if (!email || !password || !nama) {
        const error = new Error('Email, password, and name are required');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await userRepository.findUserByEmail(email);
    if (existingUser) {
        const error = new Error('Email already registered');
        error.statusCode = 400;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    return await userRepository.createCustomerWithTransaction({
        username: email,
        email,
        password: hashedPassword,
        nama
    });
};

const createTeamInternal = async ({ email, password, nama, role, creatorRole }) => {
    if (!email || !password || !nama || !role) {
        const error = new Error('Email, password, name, and role are required');
        error.statusCode = 400;
        throw error;
    }

    const validRoles = ['desain', 'gudang', 'manager', 'admin'];
    const targetRole = role.toLowerCase();
    if (!validRoles.includes(targetRole)) {
        const error = new Error('Invalid internal role');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await userRepository.findUserByEmail(email);
    if (existingUser) {
        const error = new Error('Email already registered');
        error.statusCode = 400;
        throw error;
    }

    if (creatorRole === 'admin' && targetRole === 'manager') {
        const error = new Error('Administrator tidak diizinkan membuat akun Manager');
        error.statusCode = 403;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    return await userRepository.createStaffWithTransaction({
        username: email,
        email,
        password: hashedPassword,
        role: targetRole,
        nama
    });
};

const getUserCountByRole = async (role) => {
    if (!role) {
        const error = new Error('Role is required');
        error.statusCode = 400;
        throw error;
    }

    const count = await userRepository.countUsers({
        role: role.toLowerCase()
    });

    return { object: 'user', type: role, count };
};

const getUsersByRole = async (role) => {
    if (!role) {
        const error = new Error('Role is required');
        error.statusCode = 400;
        throw error;
    }

    const lowerRole = role.toLowerCase();
    let users;

    if (lowerRole === 'customer') {
        users = await prisma.customer.findMany({
            include: { user: { select: { email: true, id: true, role: true } } }
        });
    } else if (['desain', 'manager', 'gudang', 'admin'].includes(lowerRole)) {
        users = await prisma.staff.findMany({
            where: { user: { role: lowerRole } },
            include: { user: { select: { email: true, id: true, role: true } } }
        });
    } else {
        users = await userRepository.findUsers(
            { role: lowerRole },
            { id: true, email: true, username: true, role: true }
        );
    }

    return users;
};

const getUserById = async (id) => {
    const user = await userRepository.findUserById(id);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        id: user.id,
        email: user.email,
        role: user.role,
        password: user.password,
        ...(user.customer ? user.customer : {}),
        ...(user.staff ? user.staff : {})
    };
};

const updateUser = async (id, { email, password, role, ...profileData }) => {
    const user = await userRepository.findUserById(id);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const updateData = {};
    if (email) updateData.email = email;
    if (password && password !== '********' && password !== user.password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    await prisma.$transaction(async (tx) => {
        if (Object.keys(updateData).length > 0) {
            await tx.user.update({
                where: { id: parseInt(id) },
                data: updateData
            });
        }

        if (user.role === 'customer') {
            await tx.customer.update({
                where: { userId: parseInt(id) },
                data: {
                    nama: profileData.name || profileData.nama,
                    phone: profileData.phone,
                    address: profileData.address,
                    category: profileData.category || profileData.jurusan,
                    memberSince: profileData.memberSince || profileData.tahunMasuk
                }
            });
        } else if (['desain', 'manager', 'gudang', 'admin'].includes(user.role)) {
            await tx.staff.update({
                where: { userId: parseInt(id) },
                data: {
                    nama: profileData.name || profileData.nama,
                    position: profileData.position || profileData.jabatan
                }
            });
        }
    });

    return { message: 'User updated successfully' };
};

const deleteUser = async (id) => {
    return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: parseInt(id) } });
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        if (user.role === 'customer') {
            await tx.customer.delete({ where: { userId: parseInt(id) } });
        } else if (['desain', 'manager', 'gudang', 'admin'].includes(user.role)) {
            await tx.staff.delete({ where: { userId: parseInt(id) } });
        }

        await tx.user.delete({ where: { id: parseInt(id) } });
        return { message: 'User deleted successfully' };
    });
};

const getDesigners = async () => {
    const designers = await prisma.user.findMany({
        where: { role: 'desain' },
        select: {
            id: true,
            username: true,
            email: true,
            staff: { select: { nama: true } }
        }
    });

    return designers.map(d => ({
        id: d.id,
        email: d.email,
        nama: d.staff?.nama || d.username
    }));
};

const getAllChatCustomers = async () => {
    return await prisma.user.findMany({
        where: {
            role: 'customer',
            OR: [
                { sentMessages: { some: {} } },
                { receivedMessages: { some: {} } }
            ]
        },
        include: { customer: true },
        orderBy: { id: 'desc' }
    });
};

module.exports = {
    getProfile,
    updateProfile,
    createCustomer,
    createTeamInternal,
    getUserCountByRole,
    getUsersByRole,
    getUserById,
    updateUser,
    deleteUser,
    getDesigners,
    getAllChatCustomers
};
