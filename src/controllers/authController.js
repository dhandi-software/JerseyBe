const authService = require('../services/authService');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, NODE_ENV } = require('../config/env');

const login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await authService.login(username, password);

        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('token', result.token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: isSecure ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        return res.status(200).json({
            message: 'Login successful',
            token: result.token,
            user: result.user
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const logout = (req, res) => {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('token', {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? 'none' : 'lax'
    });
    return res.status(200).json({ message: 'Logged out successfully' });
};

const register = async (req, res) => {
    try {
        const { email, password, nama } = req.body;
        const result = await authService.register({ email, password, nama });

        res.status(201).json({ message: 'Registrasi berhasil', data: result });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const result = await authService.changePassword(req.user.id, oldPassword, newPassword);
        res.status(200).json(result);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    login,
    logout,
    register,
    changePassword
};
