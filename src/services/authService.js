const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const { JWT_SECRET } = require('../config/env');

const login = async (username, password) => {
    if (typeof username !== 'string' || typeof password !== 'string') {
        const error = new Error('Format username atau password tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const cleanIdentifier = username.trim();
    if (!cleanIdentifier || !password) {
        const error = new Error('Username dan password wajib diisi');
        error.statusCode = 400;
        throw error;
    }

    const user = await userRepository.findUserByIdentifier(cleanIdentifier);
    if (!user) {
        const error = new Error('Kredensial tidak valid');
        error.statusCode = 401;
        throw error;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        const error = new Error('Kredensial tidak valid');
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
    if (typeof email !== 'string' || typeof password !== 'string' || typeof nama !== 'string') {
        const error = new Error('Format data pendaftaran tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanNama = nama.trim();

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanNama) {
        const error = new Error('Email dan nama wajib diisi dengan format valid');
        error.statusCode = 400;
        throw error;
    }

    if (password.length < 6) {
        const error = new Error('Password minimal 6 karakter');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await userRepository.findUserByEmail(cleanEmail);
    if (existingUser) {
        const error = new Error('Email sudah terdaftar');
        error.statusCode = 400;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    return await userRepository.createCustomerWithTransaction({
        username: cleanEmail,
        email: cleanEmail,
        password: hashedPassword,
        nama: cleanNama
    });
};

const changePassword = async (userId, oldPassword, newPassword) => {
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || !newPassword || newPassword.length < 6) {
        const error = new Error('Password baru minimal 6 karakter');
        error.statusCode = 400;
        throw error;
    }

    const user = await userRepository.findUserById(userId);
    if (!user) {
        const error = new Error('User tidak ditemukan');
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
