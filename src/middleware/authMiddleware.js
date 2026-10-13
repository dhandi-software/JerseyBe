const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const prisma = require('../config/prisma');

const authenticateToken = (req, res, next) => {
    let token = req.cookies?.token;

    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: Sesi atau token tidak ditemukan' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err || !decoded || !decoded.id) {
            return res.status(403).json({ message: 'Forbidden: Token tidak valid atau telah kedaluwarsa' });
        }

        try {
            const userId = parseInt(decoded.id, 10);
            if (isNaN(userId)) {
                return res.status(401).json({ message: 'Unauthorized: Format identitas tidak valid' });
            }

            // Always check live database record for authenticity and current role
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true
                }
            });

            if (!user) {
                return res.status(401).json({ message: 'Unauthorized: Pengguna tidak terdaftar di database' });
            }

            req.user = user;
            next();
        } catch (dbError) {
            console.error('Database verification error in authMiddleware:', dbError);
            return res.status(500).json({ message: 'Internal server error during verification' });
        }
    });
};

const authorizeRoles = (...allowedRoles) => {
    const roles = allowedRoles.map(r => r.toLowerCase());
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: 'Forbidden: No role assigned' });
        }
        if (!roles.includes(req.user.role.toLowerCase())) {
            return res.status(403).json({ message: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
};

module.exports = { authenticateToken, authorizeRoles };
