const crypto = require('crypto');
require('dotenv').config();

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_SECRET environment variable must be set in production!');
    }
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[SECURITY WARNING] JWT_SECRET is not set in .env; generated ephemeral random secret for this process.');
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];

module.exports = {
    PORT: parseInt(process.env.PORT || '5002', 10),
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    ALLOWED_ORIGINS,
    UPLOAD_LIMIT_MB: parseInt(process.env.UPLOAD_LIMIT_MB || '10', 10)
};
