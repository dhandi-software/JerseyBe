const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { findUserByIdentifier } = require('../models/userModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const SECRET_KEY = process.env.JWT_SECRET || 'skripsi-secret-key';

const login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await findUserByIdentifier(username);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '30d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000 
        });

        const profileName = user.customer?.nama || user.staff?.nama || user.username;

        return res.status(200).json({
            message: 'Login successful',
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
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const logout = (req, res) => {
    res.clearCookie('token');
    return res.status(200).json({ message: 'Logged out successfully' });
};

const register = async (req, res) => {
    try {
        const { email, password, nama } = req.body;

        if (!email || !password || !nama) {
            return res.status(400).json({ message: "Email, password, dan nama wajib diisi" });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email sudah terdaftar" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await prisma.$transaction(async (prisma) => {
            const user = await prisma.user.create({
                data: {
                    username: email,
                    email,
                    password: hashedPassword,
                    role: 'customer',
                }
            });

            const customer = await prisma.customer.create({
                data: {
                    userId: user.id,
                    nama
                }
            });

            return { user, customer };
        });

        res.status(201).json({ message: "Registrasi berhasil", data: result });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

module.exports = { login, logout, register };
