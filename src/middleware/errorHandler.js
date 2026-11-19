const { NODE_ENV } = require('../config/env');

const errorHandler = (err, req, res, next) => {
    console.error('Unhandled server error:', err);

    if (err && err.name === 'MulterError') {
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Ukuran file melebihi batas maksimal 10 MB.'
            : (err.message || 'Gagal memproses file unggahan.');
        return res.status(400).json({
            status: 'error',
            message
        });
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack })
    });
};

module.exports = errorHandler;
