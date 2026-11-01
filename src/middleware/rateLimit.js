const buckets = new Map();

// Periodic cleanup to prevent memory growth
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets.entries()) {
        if (now > entry.resetAt) {
            buckets.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 30,
    keyPrefix = 'rl',
    message = 'Terlalu banyak permintaan, silakan coba lagi beberapa saat.'
} = {}) => {
    return (req, res, next) => {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip) || 'unknown';
        const key = `${keyPrefix}:${ip}`;
        const now = Date.now();

        let entry = buckets.get(key);
        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            buckets.set(key, entry);
        }

        entry.count += 1;

        const remaining = Math.max(0, max - entry.count);
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));

        if (entry.count > max) {
            const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                status: 'error',
                message
            });
        }

        next();
    };
};

module.exports = {
    createRateLimiter
};

