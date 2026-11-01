const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const errorHandler = require('./middleware/errorHandler');
const { PORT, ALLOWED_ORIGINS } = require('./config/env');

const app = express();
app.disable('x-powered-by');

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

const isOriginAllowed = (origin) => {
    if (!origin) return true;
    const normalizedOrigin = origin.trim().replace(/\/$/, '');
    if (ALLOWED_ORIGINS.includes(normalizedOrigin)) return true;
    try {
        const { hostname } = new URL(normalizedOrigin);
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.endsWith('.trycloudflare.com') ||
            hostname.endsWith('.up.railway.app')
        ) {
            return true;
        }
    } catch {
        return false;
    }
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Static file serving with traversal protection, security headers, and WebP fallback
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");

    const safePath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, '');
    const resolvedPath = path.resolve(uploadsDir, '.' + safePath);

    if (!resolvedPath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Forbidden: Invalid file path' });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext === '.pdf') {
        res.setHeader('Content-Disposition', 'inline');
    }

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        if (!fs.existsSync(resolvedPath)) {
            const webpPath = resolvedPath.slice(0, -ext.length) + '.webp';
            if (fs.existsSync(webpPath)) {
                return res.sendFile(webpPath);
            }
        }
    }
    next();
});
app.use('/uploads', express.static(uploadsDir, { dotfiles: 'ignore', index: false }));

// Core Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/bahan-baju', require('./routes/bahanBajuRoutes'));

// Health Check
app.get('/', (req, res) => {
    res.send({ message: 'FCSV Backend is running!' });
});

// Central error handler
app.use(errorHandler);

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Blocked by Socket CORS policy'));
        },
        credentials: true,
        methods: ["GET", "POST"]
    }
});

app.set('io', io);
require('./socket')(io);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
