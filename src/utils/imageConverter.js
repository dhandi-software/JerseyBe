const path = require('path');
const fs = require('fs');

let sharp;
try {
    sharp = require('sharp');
} catch (err) {
    console.warn('Sharp module not loaded, image conversion will use fallback:', err.message);
}

/**
 * Convert an image file on disk to WebP format.
 * If already webp or unsupported format, returns original.
 * Removes original file if successfully converted.
 */
async function convertFileToWebP(filePath) {
    if (!sharp || !filePath || !fs.existsSync(filePath)) {
        return {
            filename: path.basename(filePath || ''),
            filePath: filePath,
            converted: false
        };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.webp') {
        return {
            filename: path.basename(filePath),
            filePath: filePath,
            converted: false
        };
    }

    // Supported formats for conversion
    if (!['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif'].includes(ext)) {
        return {
            filename: path.basename(filePath),
            filePath: filePath,
            converted: false
        };
    }

    const dir = path.dirname(filePath);
    const basenameWithoutExt = path.basename(filePath, ext);
    const webpFilename = `${basenameWithoutExt}.webp`;
    const webpPath = path.join(dir, webpFilename);

    try {
        await sharp(filePath)
            .webp({ quality: 85, effort: 4 })
            .toFile(webpPath);

        // Remove original file after successful conversion
        if (filePath !== webpPath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkErr) {
                console.warn(`Could not remove original file ${filePath}:`, unlinkErr.message);
            }
        }

        return {
            filename: webpFilename,
            filePath: webpPath,
            converted: true
        };
    } catch (error) {
        console.error(`Failed to convert image ${filePath} to WebP:`, error);
        return {
            filename: path.basename(filePath),
            filePath: filePath,
            converted: false
        };
    }
}

/**
 * Express middleware to automatically convert all files uploaded via Multer to WebP
 */
const webpConversionMiddleware = async (req, res, next) => {
    try {
        // Handle single file (req.file)
        if (req.file && req.file.path) {
            const result = await convertFileToWebP(req.file.path);
            if (result.converted) {
                req.file.filename = result.filename;
                req.file.path = result.filePath;
                req.file.mimetype = 'image/webp';
            }
        }

        // Handle multiple files (req.files as array or object with fields)
        if (req.files) {
            if (Array.isArray(req.files)) {
                for (const file of req.files) {
                    if (file && file.path) {
                        const result = await convertFileToWebP(file.path);
                        if (result.converted) {
                            file.filename = result.filename;
                            file.path = result.filePath;
                            file.mimetype = 'image/webp';
                        }
                    }
                }
            } else if (typeof req.files === 'object') {
                for (const fieldName of Object.keys(req.files)) {
                    const fileList = req.files[fieldName];
                    if (Array.isArray(fileList)) {
                        for (const file of fileList) {
                            if (file && file.path) {
                                const result = await convertFileToWebP(file.path);
                                if (result.converted) {
                                    file.filename = result.filename;
                                    file.path = result.filePath;
                                    file.mimetype = 'image/webp';
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error during WebP conversion middleware:', err);
    }
    next();
};

module.exports = {
    convertFileToWebP,
    webpConversionMiddleware
};
