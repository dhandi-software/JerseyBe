require('dotenv').config();
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL || 'postgresql://postgres:DhandiAdam@localhost:5434/JerseyBaju?schema=public'
        }
    }
});

const TARGET_DIRECTORIES = [
    path.resolve(__dirname, '../uploads'),
    path.resolve(__dirname, '../../deploy/uploads'),
    path.resolve(__dirname, '../../FCSV_FE/public/images')
];

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'];

function getFilesRecursively(dir) {
    if (!fs.existsSync(dir)) return [];
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFilesRecursively(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

function toWebpUrl(originalUrl) {
    if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
    const ext = path.extname(originalUrl).toLowerCase();
    if (IMAGE_EXTS.includes(ext)) {
        return originalUrl.slice(0, -ext.length) + '.webp';
    }
    return originalUrl;
}

async function convertFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) return null;

    const dir = path.dirname(filePath);
    const basenameWithoutExt = path.basename(filePath, ext);
    const webpPath = path.join(dir, `${basenameWithoutExt}.webp`);

    try {
        const originalSize = fs.statSync(filePath).size;
        await sharp(filePath)
            .webp({ quality: 85, effort: 4 })
            .toFile(webpPath);
        
        const webpSize = fs.statSync(webpPath).size;
        const savedPercent = Math.round((1 - (webpSize / originalSize)) * 100);

        console.log(`[CONVERTED] ${path.basename(filePath)} (${(originalSize/1024).toFixed(1)} KB) -> ${path.basename(webpPath)} (${(webpSize/1024).toFixed(1)} KB) [${savedPercent}% smaller]`);
        return { original: filePath, webp: webpPath, originalSize, webpSize };
    } catch (err) {
        console.error(`[ERROR] Failed to convert ${filePath}:`, err.message);
        return null;
    }
}

async function convertAllFiles() {
    console.log('=== STEP 1: CONVERTING IMAGE FILES TO WEBP ===\n');
    let totalOriginalBytes = 0;
    let totalWebpBytes = 0;
    let convertedCount = 0;

    for (const dir of TARGET_DIRECTORIES) {
        if (!fs.existsSync(dir)) {
            console.log(`Directory does not exist, skipping: ${dir}`);
            continue;
        }
        console.log(`Scanning: ${dir}`);
        const files = getFilesRecursively(dir);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (IMAGE_EXTS.includes(ext)) {
                const res = await convertFile(file);
                if (res) {
                    convertedCount++;
                    totalOriginalBytes += res.originalSize;
                    totalWebpBytes += res.webpSize;
                }
            }
        }
    }

    console.log(`\nFiles converted: ${convertedCount}`);
    if (convertedCount > 0) {
        const totalSaved = totalOriginalBytes - totalWebpBytes;
        console.log(`Total original: ${(totalOriginalBytes / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`Total WebP:     ${(totalWebpBytes / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`Total saved:    ${(totalSaved / (1024 * 1024)).toFixed(2)} MB (${Math.round((totalSaved / totalOriginalBytes) * 100)}% savings)`);
    }
}

async function updateDatabaseRecords() {
    console.log('\n=== STEP 2: UPDATING DATABASE IMAGE PATHS TO WEBP ===\n');

    try {
        // 1. BahanBaju (Admin Products)
        const bahanList = await prisma.bahanBaju.findMany();
        let bahanUpdated = 0;
        for (const b of bahanList) {
            const newImage = toWebpUrl(b.imageUrl);
            const newBukti = toWebpUrl(b.buktiNotaUrl);

            if (newImage !== b.imageUrl || newBukti !== b.buktiNotaUrl) {
                await prisma.bahanBaju.update({
                    where: { id: b.id },
                    data: {
                        imageUrl: newImage,
                        buktiNotaUrl: newBukti
                    }
                });
                console.log(`[DB BahanBaju ID ${b.id}] Updated:`);
                if (newImage !== b.imageUrl) console.log(`  image: ${b.imageUrl} -> ${newImage}`);
                if (newBukti !== b.buktiNotaUrl) console.log(`  bukti: ${b.buktiNotaUrl} -> ${newBukti}`);
                bahanUpdated++;
            }
        }
        console.log(`BahanBaju records updated: ${bahanUpdated}`);

        // 2. User Profiles
        const userList = await prisma.user.findMany();
        let userUpdated = 0;
        for (const u of userList) {
            const newPhoto = toWebpUrl(u.photo);
            if (newPhoto !== u.photo) {
                await prisma.user.update({
                    where: { id: u.id },
                    data: { photo: newPhoto }
                });
                console.log(`[DB User ID ${u.id}] Updated photo: ${u.photo} -> ${newPhoto}`);
                userUpdated++;
            }
        }
        console.log(`User records updated: ${userUpdated}`);

        // 3. JerseyOrders
        const orderList = await prisma.jerseyOrder.findMany();
        let orderUpdated = 0;
        for (const o of orderList) {
            const newMockup = toWebpUrl(o.mockupUrl);
            const newLayout = toWebpUrl(o.layoutUrl);
            const newPrint = toWebpUrl(o.printUrl);
            const newFinishing = toWebpUrl(o.finishingUrl);
            const newDesign = toWebpUrl(o.designUrl);
            const newPayment = toWebpUrl(o.paymentUrl);

            if (
                newMockup !== o.mockupUrl ||
                newLayout !== o.layoutUrl ||
                newPrint !== o.printUrl ||
                newFinishing !== o.finishingUrl ||
                newDesign !== o.designUrl ||
                newPayment !== o.paymentUrl
            ) {
                await prisma.jerseyOrder.update({
                    where: { id: o.id },
                    data: {
                        mockupUrl: newMockup,
                        layoutUrl: newLayout,
                        printUrl: newPrint,
                        finishingUrl: newFinishing,
                        designUrl: newDesign,
                        paymentUrl: newPayment
                    }
                });
                console.log(`[DB Order ID ${o.id}] Updated order images`);
                orderUpdated++;
            }
        }
        console.log(`JerseyOrder records updated: ${orderUpdated}`);

        // 4. Messages (Chat attachments)
        const messages = await prisma.message.findMany({
            where: { attachmentUrl: { not: null } }
        });
        let msgUpdated = 0;
        for (const m of messages) {
            const newAttachment = toWebpUrl(m.attachmentUrl);
            if (newAttachment !== m.attachmentUrl) {
                await prisma.message.update({
                    where: { id: m.id },
                    data: { attachmentUrl: newAttachment }
                });
                console.log(`[DB Message ID ${m.id}] Updated attachment: ${m.attachmentUrl} -> ${newAttachment}`);
                msgUpdated++;
            }
        }
        console.log(`Message records updated: ${msgUpdated}`);

    } catch (err) {
        console.error('[DB ERROR] Failed updating database records:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    console.log('Starting WebP migration...\n');
    await convertAllFiles();
    await updateDatabaseRecords();
    console.log('\nWebP migration complete!');
}

main().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
});
