const { NODE_ENV } = require('../config/env');

const errorHandler = (err, req, res, next) => {
    console.error('Unhandled server error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
