const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const { JWT_SECRET } = require('../config/env');

const login = async (username, password) => {
    const user = await userRepository.findUserByIdentifier(username);
    if (!user) {
        const error = new Error('Invalid credentials');
        error.statusCode = 401;
        throw error;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        const error = new Error('Invalid credentials');
        error.statusCode = 401;
        throw error;
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
    );

    const profileName = user.customer?.nama || user.staff?.nama || user.username;

    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            name: profileName,
            role: user.role,
            customerId: user.customer?.id,
            staffId: user.staff?.id
        }
    };
};

const register = async ({ email, password, nama }) => {
    if (!email || !password || !nama) {
        const error = new Error('Email, password, dan nama wajib diisi');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await userRepository.findUserByEmail(email);
    if (existingUser) {
        const error = new Error('Email sudah terdaftar');
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

const changePassword = async (userId, oldPassword, newPassword) => {
    const user = await userRepository.findUserById(userId);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
        const error = new Error('Password lama tidak sesuai');
        error.statusCode = 400;
        throw error;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await userRepository.updateUser(userId, { password: hashedNewPassword });

    return { message: 'Password berhasil diubah' };
};

module.exports = {
    login,
    register,
    changePassword
};
