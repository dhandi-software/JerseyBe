const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { webpConversionMiddleware } = require('../utils/imageConverter');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.pdf']);
const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'application/pdf'
]);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, uniqueSuffix + safeExt);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMES.has(file.mimetype.toLowerCase())) {
        const error = new Error('Tipe file tidak didukung. Hanya gambar (JPG, PNG, WebP) dan PDF yang diperbolehkan.');
        error.statusCode = 400;
        return cb(error, false);
    }
    cb(null, true);
};

const multerInstance = multer({ 
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper wrapper that automatically chains webp conversion after upload
const upload = {
    single: (fieldName) => [multerInstance.single(fieldName), webpConversionMiddleware],
    fields: (fields) => [multerInstance.fields(fields), webpConversionMiddleware],
    array: (fieldName, maxCount) => [multerInstance.array(fieldName, maxCount), webpConversionMiddleware],
    none: () => multerInstance.none(),
    any: () => [multerInstance.any(), webpConversionMiddleware]
};

module.exports = upload;
