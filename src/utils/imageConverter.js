const path = require('path');
const fs = require('fs');

let sharp;
try {
    sharp = require('sharp');
} catch (err) {
    console.warn('Sharp module not loaded, image conversion will use fallback:', err.message);
}

function isValidPdfMagicBytes(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(5);
        const bytesRead = fs.readSync(fd, buf, 0, 5, 0);
        fs.closeSync(fd);
        return bytesRead === 5 && buf.toString('ascii') === '%PDF-';
    } catch {
        return false;
    }
}

async function convertFileToWebP(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return {
            filename: path.basename(filePath || ''),
            filePath: filePath,
            converted: false
        };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        if (!isValidPdfMagicBytes(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch {}
            const error = new Error('File PDF tidak valid atau rusak.');
            error.statusCode = 400;
            throw error;
        }
        return {
            filename: path.basename(filePath),
            filePath: filePath,
            converted: false
        };
    }

    if (!sharp || ext === '.webp') {
        return {
            filename: path.basename(filePath),
            filePath: filePath,
            converted: false
        };
    }

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

const webpConversionMiddleware = async (req, res, next) => {
    try {
        if (req.file && req.file.path) {
            const result = await convertFileToWebP(req.file.path);
            if (result.converted) {
                req.file.filename = result.filename;
                req.file.path = result.filePath;
                req.file.mimetype = 'image/webp';
            }
        }

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
        if (err && err.statusCode) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        console.error('Error during WebP conversion middleware:', err);
    }
    next();
};

module.exports = {
    convertFileToWebP,
    webpConversionMiddleware
};
