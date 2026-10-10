require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 5002,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET || 'skripsi-secret-key',
    NODE_ENV: process.env.NODE_ENV || 'development',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
};
