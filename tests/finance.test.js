const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

const { app } = require('../src/index');
const prisma = require('../src/config/prisma');
const { JWT_SECRET } = require('../src/config/env');

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

let VALID_PNG_BUFFER;
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'ascii');
const INVALID_PDF_BUFFER = Buffer.from('NOT-A-PDF-HEADER-CONTENT', 'ascii');

const signUserToken = (user) => {
    return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
};

const countPdfPages = (pdfBuffer) => {
    const matches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g);
    return matches ? matches.length : 0;
};

const extractPdfPageStreams = (pdfBuffer) => {
    const raw = pdfBuffer.toString('latin1');
    const pageObjs = [...raw.matchAll(/(?:^|\r?\n)(\d+)\s+0\s+obj\s*<<((?:(?!\bstream\b)[\s\S])*?)>>\s*endobj/g)]
        .filter((m) => /\/Type\s*\/Page\b(?!s)/.test(m[2]));

    return pageObjs.map((pageMatch) => {
        const contentsMatch = /\/Contents\s+(\d+)\s+0\s+R/.exec(pageMatch[2]);
        if (!contentsMatch) return '';
        const streamRe = new RegExp(
            `(?:^|\\r?\\n)${contentsMatch[1]}\\s+0\\s+obj\\s*<<(?:(?!endobj)[\\s\\S])*?>>\\s*stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`
        );
        const streamMatch = streamRe.exec(raw);
        if (!streamMatch) return '';
        const inflated = zlib.inflateSync(Buffer.from(streamMatch[1], 'latin1')).toString('latin1');
        return inflated
            .replace(/\[([^\]]+)\]\s*TJ/g, (_, arrBody) => {
                const hexParts = [...arrBody.matchAll(/<([0-9a-fA-F]+)>/g)]
                    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'));
                return hexParts.join('');
            })
            .replace(/<([0-9a-fA-F]+)>\s*Tj/g, (_, hex) => Buffer.from(hex, 'hex').toString('latin1'));
    });
};

const extractPdfReadableText = (pdfBuffer) => {
    const raw = pdfBuffer.toString('latin1');
    return [raw, ...extractPdfPageStreams(pdfBuffer)].join('\n');
};

const containsPasswordKey = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) return obj.some(containsPasswordKey);
    for (const key of Object.keys(obj)) {
        if (key === 'password') return true;
        if (containsPasswordKey(obj[key])) return true;
    }
    return false;
};

describe('M1 Finance, Reporting & PDF Integration Suite', () => {
    let server;
    let baseUrl;
    const tokens = {};
    const users = {};
    const createdIds = {
        financeTx: [],
        bahan: [],
        bahanHistory: [],
        orders: []
    };
    const trackedUploadUrls = new Set();

    const trackUploadUrl = (url) => {
        if (typeof url === 'string' && url.startsWith('/uploads/')) {
            trackedUploadUrls.add(url);
        }
    };

    const resolveUploadFile = (url) => {
        if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
        return path.resolve(UPLOADS_DIR, url.slice('/uploads/'.length));
    };

    const apiFetch = async (urlPath, { token, method = 'GET', body, headers = {} } = {}) => {
        const finalHeaders = { ...headers };
        if (token) {
            finalHeaders.Authorization = `Bearer ${token}`;
        }
        return fetch(`${baseUrl}${urlPath}`, {
            method,
            headers: finalHeaders,
            body
        });
    };

    before(async () => {
        VALID_PNG_BUFFER = await sharp({
            create: { width: 24, height: 24, channels: 3, background: { r: 210, g: 80, b: 38 } }
        }).png().toBuffer();

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;

        const allUsers = await prisma.user.findMany({
            where: { role: { in: ['admin', 'manager', 'customer', 'desain', 'gudang'] } },
            select: { id: true, role: true, username: true }
        });
        for (const u of allUsers) {
            const roleKey = u.role.toLowerCase();
            if (!users[roleKey]) {
                users[roleKey] = u;
                tokens[roleKey] = signUserToken(u);
            }
        }

        for (const requiredRole of ['admin', 'manager', 'customer', 'desain', 'gudang']) {
            assert.ok(tokens[requiredRole], `Missing seeded user for role ${requiredRole}`);
        }
    });

    after(async () => {
        try {
            if (createdIds.financeTx.length > 0) {
                await prisma.financeTransaction.deleteMany({
                    where: { id: { in: createdIds.financeTx } }
                });
            }
            if (createdIds.bahanHistory.length > 0) {
                await prisma.bahanBajuHistory.deleteMany({
                    where: { id: { in: createdIds.bahanHistory } }
                });
            }
            if (createdIds.bahan.length > 0) {
                await prisma.bahanBajuHistory.deleteMany({
                    where: { bahanId: { in: createdIds.bahan } }
                });
                await prisma.bahanBaju.deleteMany({
                    where: { id: { in: createdIds.bahan } }
                });
            }
            if (createdIds.orders.length > 0) {
                await prisma.orderPayment.deleteMany({
                    where: { orderId: { in: createdIds.orders } }
                });
                await prisma.jerseyOrderDetail.deleteMany({
                    where: { orderId: { in: createdIds.orders } }
                });
                await prisma.jerseyOrder.deleteMany({
                    where: { id: { in: createdIds.orders } }
                });
            }
            for (const url of trackedUploadUrls) {
                const abs = resolveUploadFile(url);
                if (abs && abs.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(abs)) {
                    fs.unlinkSync(abs);
                }
            }
        } finally {
            await prisma.$disconnect();
            if (server) {
                await new Promise((resolve) => server.close(() => resolve()));
            }
        }
    });

    it('enforces RBAC: 401 unauthenticated, 403 for non-admin/manager, 200 for admin and manager', async () => {
        const unauthRes = await apiFetch('/api/admin/finance/overview');
        assert.equal(unauthRes.status, 401);

        const unauthPdf = await apiFetch('/api/admin/finance/export-pdf');
        assert.equal(unauthPdf.status, 401);

        for (const forbiddenRole of ['customer', 'desain', 'gudang']) {
            const overviewRes = await apiFetch('/api/admin/finance/overview', { token: tokens[forbiddenRole] });
            assert.equal(overviewRes.status, 403, `${forbiddenRole} must be denied on finance overview`);

            const createRes = await apiFetch('/api/admin/finance/transactions', {
                token: tokens[forbiddenRole],
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'PENGELUARAN',
                    category: 'Operasional',
                    title: 'Should fail',
                    amount: 10000
                })
            });
            assert.equal(createRes.status, 403, `${forbiddenRole} must be denied on finance create`);

            const omsetRes = await apiFetch('/api/admin/omset-report', { token: tokens[forbiddenRole] });
            assert.equal(omsetRes.status, 403, `${forbiddenRole} must be denied on omset-report`);
        }

        for (const allowedRole of ['admin', 'manager']) {
            const overviewRes = await apiFetch('/api/admin/finance/overview', { token: tokens[allowedRole] });
            assert.equal(overviewRes.status, 200);
            const payload = await overviewRes.json();
            assert.equal(payload.success, true);
            assert.equal(containsPasswordKey(payload), false);
        }
    });

    it('supports manual transaction CRUD with PNG->WebP conversion, PDF upload, validation cleanup, and file deletion', async () => {
        const filesBeforeInvalid = new Set(fs.readdirSync(UPLOADS_DIR));

        // 1. Validation error with attached image must return 400 and unlink uploaded file
        const invalidForm = new FormData();
        invalidForm.append('type', 'PENGELUARAN');
        invalidForm.append('category', 'Operasional');
        invalidForm.append('title', '');
        invalidForm.append('amount', '-500');
        invalidForm.append('buktiNota', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'invalid-tx.png');

        const invalidRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.manager,
            method: 'POST',
            body: invalidForm
        });
        assert.equal(invalidRes.status, 400);
        const filesAfterInvalid = fs.readdirSync(UPLOADS_DIR);
        assert.deepEqual(filesAfterInvalid.filter((f) => !filesBeforeInvalid.has(f)), []);

        // 2. Fake PDF magic bytes must be rejected with 400 and cleaned up
        const fakePdfForm = new FormData();
        fakePdfForm.append('type', 'PENGELUARAN');
        fakePdfForm.append('category', 'Listrik');
        fakePdfForm.append('title', 'Tagihan Palsu');
        fakePdfForm.append('amount', '50000');
        fakePdfForm.append('buktiNota', new Blob([INVALID_PDF_BUFFER], { type: 'application/pdf' }), 'fake.pdf');

        const fakePdfRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.manager,
            method: 'POST',
            body: fakePdfForm
        });
        assert.equal(fakePdfRes.status, 400);

        // 3. Create valid PENGELUARAN as manager with PNG receipt (converted to .webp)
        const createForm = new FormData();
        createForm.append('type', 'PENGELUARAN');
        createForm.append('category', 'Listrik & Air');
        createForm.append('title', 'Bayar Listrik Workshop Test');
        createForm.append('description', 'Tagihan bulan uji coba');
        createForm.append('amount', '125000');
        createForm.append('transactionDate', '2029-04-12');
        createForm.append('paymentMethod', 'TRANSFER');
        createForm.append('buktiNota', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'nota-listrik.png');

        const createRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.manager,
            method: 'POST',
            body: createForm
        });
        assert.equal(createRes.status, 201);
        const createdJson = await createRes.json();
        assert.equal(createdJson.success, true);
        assert.equal(containsPasswordKey(createdJson), false);

        const tx = createdJson.data;
        createdIds.financeTx.push(tx.id);
        trackUploadUrl(tx.buktiNotaUrl);

        assert.equal(tx.type, 'PENGELUARAN');
        assert.equal(tx.amount, 125000);
        assert.equal(tx.dateWib, '2029-04-12');
        assert.ok(tx.buktiNotaUrl.startsWith('/uploads/') && tx.buktiNotaUrl.endsWith('.webp'));
        const webpAbs = resolveUploadFile(tx.buktiNotaUrl);
        assert.equal(fs.existsSync(webpAbs), true);

        // 4. List transactions filtered to period
        const listRes = await apiFetch('/api/admin/finance/transactions?periodType=daily&date=2029-04-12&search=Listrik', {
            token: tokens.admin
        });
        assert.equal(listRes.status, 200);
        const listJson = await listRes.json();
        assert.equal(listJson.data.length, 1);
        assert.equal(listJson.data[0].id, tx.id);
        assert.equal(containsPasswordKey(listJson), false);

        // 5. Update transaction replacing WebP receipt with valid PDF -> old WebP unlinked
        const replaceForm = new FormData();
        replaceForm.append('title', 'Bayar Listrik Updated');
        replaceForm.append('amount', '150000');
        replaceForm.append('buktiNota', new Blob([VALID_PDF_BUFFER], { type: 'application/pdf' }), 'nota-baru.pdf');

        const replaceRes = await apiFetch(`/api/admin/finance/transactions/${tx.id}`, {
            token: tokens.admin,
            method: 'PUT',
            body: replaceForm
        });
        assert.equal(replaceRes.status, 200);
        const replaceJson = await replaceRes.json();
        const pdfUrl = replaceJson.data.buktiNotaUrl;
        trackUploadUrl(pdfUrl);

        assert.equal(replaceJson.data.title, 'Bayar Listrik Updated');
        assert.equal(replaceJson.data.amount, 150000);
        assert.ok(pdfUrl.endsWith('.pdf'));
        assert.equal(fs.existsSync(webpAbs), false, 'Old WebP receipt must be unlinked after replacement');
        const pdfAbs = resolveUploadFile(pdfUrl);
        assert.equal(fs.existsSync(pdfAbs), true);

        // 6. Update with removeReceipt=true -> PDF unlinked and buktiNotaUrl cleared
        const removeRes = await apiFetch(`/api/admin/finance/transactions/${tx.id}`, {
            token: tokens.manager,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeReceipt: 'true' })
        });
        assert.equal(removeRes.status, 200);
        const removeJson = await removeRes.json();
        assert.equal(removeJson.data.buktiNotaUrl, null);
        assert.equal(fs.existsSync(pdfAbs), false, 'Removed PDF receipt must be unlinked');

        // 7. Re-attach PNG receipt and verify DELETE unlinks it cleanly
        const reattachForm = new FormData();
        reattachForm.append('buktiNota', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'final.png');
        const reattachRes = await apiFetch(`/api/admin/finance/transactions/${tx.id}`, {
            token: tokens.admin,
            method: 'PUT',
            body: reattachForm
        });
        assert.equal(reattachRes.status, 200);
        const reattachJson = await reattachRes.json();
        trackUploadUrl(reattachJson.data.buktiNotaUrl);
        const finalWebpAbs = resolveUploadFile(reattachJson.data.buktiNotaUrl);
        assert.equal(fs.existsSync(finalWebpAbs), true);

        const delRes = await apiFetch(`/api/admin/finance/transactions/${tx.id}`, {
            token: tokens.admin,
            method: 'DELETE'
        });
        assert.equal(delRes.status, 200);
        assert.equal(fs.existsSync(finalWebpAbs), false, 'Receipt file must be unlinked on DELETE');

        const notFoundRes = await apiFetch(`/api/admin/finance/transactions/${tx.id}`, {
            token: tokens.admin,
            method: 'DELETE'
        });
        assert.equal(notFoundRes.status, 404);

        // 8. Edge-case validation: boolean/array amount, invalid ISO date, numeric string date -> 400
        for (const badPayload of [
            { type: 'PENGELUARAN', category: 'Test', title: 'Bool amount', amount: true },
            { type: 'PENGELUARAN', category: 'Test', title: 'Array amount', amount: [100] },
            { type: 'PENGELUARAN', category: 'Test', title: 'Non-leap ISO', amount: 50000, transactionDate: '2026-02-29T10:00:00+07:00' },
            { type: 'PENGELUARAN', category: 'Test', title: 'Numeric string date', amount: 50000, transactionDate: '12345' }
        ]) {
            const badRes = await apiFetch('/api/admin/finance/transactions', {
                token: tokens.admin,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(badPayload)
            });
            assert.equal(badRes.status, 400, `Expected 400 for ${badPayload.title}`);
        }

        // 9. Offset-less ISO datetime defaults to +07:00 WIB
        const offsetlessRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.admin,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'PEMASUKAN',
                category: 'Lainnya',
                title: 'Offsetless WIB Datetime',
                amount: 10000,
                transactionDate: '2029-04-12T23:30:00'
            })
        });
        assert.equal(offsetlessRes.status, 201);
        const offsetlessJson = await offsetlessRes.json();
        createdIds.financeTx.push(offsetlessJson.data.id);
        assert.equal(offsetlessJson.data.dateWib, '2029-04-12');
    });

    it('propagates buktiNotaUrl onto BahanBajuHistory during createBahan and updateBahan', async () => {
        const createBahanForm = new FormData();
        createBahanForm.append('nama', 'Bahan Test Nota Propagation');
        createBahanForm.append('kuantitasKg', '10');
        createBahanForm.append('harga', '80000');
        createBahanForm.append('hargaBeli', '500000');
        createBahanForm.append('buktiNota', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'nota-bahan-1.png');

        const createRes = await apiFetch('/api/bahan-baju', {
            token: tokens.admin,
            method: 'POST',
            body: createBahanForm
        });
        assert.equal(createRes.status, 200);
        const createJson = await createRes.json();
        const bahan = createJson.data;
        createdIds.bahan.push(bahan.id);
        trackUploadUrl(bahan.buktiNotaUrl);
        assert.ok(bahan.buktiNotaUrl && bahan.buktiNotaUrl.endsWith('.webp'));

        const historiesAfterCreate = await prisma.bahanBajuHistory.findMany({
            where: { bahanId: bahan.id },
            orderBy: { id: 'asc' }
        });
        assert.equal(historiesAfterCreate.length, 1);
        assert.equal(historiesAfterCreate[0].aksi, 'BUAT');
        assert.equal(historiesAfterCreate[0].buktiNotaUrl, bahan.buktiNotaUrl);

        const updateBahanForm = new FormData();
        updateBahanForm.append('nama', bahan.nama);
        updateBahanForm.append('kuantitasKg', '20');
        updateBahanForm.append('harga', '80000');
        updateBahanForm.append('hargaBeli', '900000');
        updateBahanForm.append('buktiNota', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'nota-bahan-2.png');

        const updateRes = await apiFetch(`/api/bahan-baju/${bahan.id}`, {
            token: tokens.admin,
            method: 'PUT',
            body: updateBahanForm
        });
        assert.equal(updateRes.status, 200);
        const updateJson = await updateRes.json();
        trackUploadUrl(updateJson.data.buktiNotaUrl);

        const historiesAfterUpdate = await prisma.bahanBajuHistory.findMany({
            where: { bahanId: bahan.id },
            orderBy: { id: 'asc' }
        });
        assert.equal(historiesAfterUpdate.length, 2);
        assert.equal(historiesAfterUpdate[1].aksi, 'TAMBAH');
        assert.equal(historiesAfterUpdate[1].buktiNotaUrl, updateJson.data.buktiNotaUrl);
        assert.notEqual(historiesAfterUpdate[1].buktiNotaUrl, historiesAfterCreate[0].buktiNotaUrl);
    });

    it('aggregates disjoint ORDER, BAHAN_BAKU, and MANUAL sources with zero double-counting and backward compatibility', async () => {
        const targetTime = new Date('2029-05-15T10:00:00.000+07:00');

        const activeOrder = await prisma.jerseyOrder.create({
            data: {
                orderId: `FIN-TEST-ACT-${Date.now()}`,
                customerId: users.customer.id,
                customerName: 'Tim Garuda Test',
                status: 'PROSES',
                totalAmount: 1000000,
                paidAmount: 400000,
                remainingAmount: 600000,
                paymentType: 'DP',
                paymentUrl: '/uploads/order-dp-test.webp',
                createdAt: targetTime,
                details: {
                    create: [{ productTitle: 'Jersey Futsal Pro', playerSize: 'L', unitPrice: 1000000 }]
                },
                payments: {
                    create: [
                        { installmentNo: 1, stage: 'DP', amount: 250000, createdAt: targetTime },
                        { installmentNo: 2, stage: 'DP', amount: 150000, createdAt: targetTime }
                    ]
                }
            }
        });
        createdIds.orders.push(activeOrder.id);

        const batalOrder = await prisma.jerseyOrder.create({
            data: {
                orderId: `FIN-TEST-BATAL-${Date.now()}`,
                customerId: users.customer.id,
                customerName: 'Batal Order',
                status: 'BATAL',
                totalAmount: 500000,
                paidAmount: 500000,
                createdAt: targetTime
            }
        });
        createdIds.orders.push(batalOrder.id);

        const ditolakOrder = await prisma.jerseyOrder.create({
            data: {
                orderId: `FIN-TEST-TOLAK-${Date.now()}`,
                customerId: users.customer.id,
                customerName: 'Tolak Order',
                status: 'DITOLAK',
                totalAmount: 500000,
                paidAmount: 500000,
                createdAt: targetTime
            }
        });
        createdIds.orders.push(ditolakOrder.id);

        const seedOrder = await prisma.jerseyOrder.create({
            data: {
                orderId: `SEED-FIN-TEST-${Date.now()}`,
                customerId: users.customer.id,
                customerName: 'Seed Order',
                status: 'SELESAI',
                totalAmount: 500000,
                paidAmount: 500000,
                createdAt: targetTime
            }
        });
        createdIds.orders.push(seedOrder.id);

        const tambahStokHistory = await prisma.bahanBajuHistory.create({
            data: {
                aksi: 'TAMBAH_STOK',
                namaBahan: 'Dry-Fit Test 2029',
                jumlah: 5,
                stokAkhir: 15,
                totalNilai: 150000,
                actor: 'Gudang',
                createdAt: new Date('2029-05-15T11:00:00.000+07:00')
            }
        });
        createdIds.bahanHistory.push(tambahStokHistory.id);

        const pemakaianHistory = await prisma.bahanBajuHistory.create({
            data: {
                aksi: 'PEMAKAIAN',
                namaBahan: 'Dry-Fit Test 2029',
                jumlah: 2,
                stokAkhir: 13,
                totalNilai: 99999,
                actor: 'Gudang',
                createdAt: new Date('2029-05-15T12:00:00.000+07:00')
            }
        });
        createdIds.bahanHistory.push(pemakaianHistory.id);

        const manualIn = await prisma.financeTransaction.create({
            data: {
                type: 'PEMASUKAN',
                category: 'Jasa Desain',
                title: 'Pendapatan Desain Logo',
                amount: 75000,
                transactionDate: new Date('2029-05-15T13:00:00.000+07:00'),
                createdById: users.admin.id,
                createdByName: 'Admin'
            }
        });
        createdIds.financeTx.push(manualIn.id);

        const manualOut = await prisma.financeTransaction.create({
            data: {
                type: 'PENGELUARAN',
                category: 'Kurir',
                title: 'Ongkir Bahan',
                amount: 25000,
                transactionDate: new Date('2029-05-15T14:00:00.000+07:00'),
                createdById: users.manager.id,
                createdByName: 'Manager'
            }
        });
        createdIds.financeTx.push(manualOut.id);

        const overviewRes = await apiFetch('/api/admin/finance/overview?periodType=daily&date=2029-05-15', {
            token: tokens.admin
        });
        assert.equal(overviewRes.status, 200);
        const { data } = await overviewRes.json();

        assert.equal(data.summary.orderPemasukan, 400000);
        assert.equal(data.summary.manualPemasukan, 75000);
        assert.equal(data.summary.totalPemasukan, 475000);
        assert.equal(data.summary.bahanPengeluaran, 150000);
        assert.equal(data.summary.manualPengeluaran, 25000);
        assert.equal(data.summary.totalPengeluaran, 175000);
        assert.equal(data.summary.netProfit, 300000);
        assert.equal(data.summary.transactionCount, 4);
        assert.equal(data.chartData.length, 24);

        const omsetRes = await apiFetch('/api/admin/omset-report?periodType=daily&date=2029-05-15', {
            token: tokens.manager
        });
        assert.equal(omsetRes.status, 200);
        const omsetJson = await omsetRes.json();
        assert.equal(omsetJson.data.totalPemasukan, 475000);
        assert.equal(omsetJson.data.totalPengeluaran, 175000);
        assert.equal(omsetJson.data.netProfit, 300000);
        assert.ok(Array.isArray(omsetJson.data.bahanPerformance));
        assert.ok(Array.isArray(omsetJson.data.revenueBreakdown));

        const dashRes = await apiFetch('/api/admin/dashboard-stats', { token: tokens.admin });
        assert.equal(dashRes.status, 200);
        const dashJson = await dashRes.json();
        for (const key of [
            'totalCustomer', 'totalStaff', 'totalAdmin', 'totalRevenue',
            'salesData', 'recentCustomers', 'recentChats', 'totalUnreadChat',
            'bestMonth', 'bestYear', 'topBuyer', 'newOrders'
        ]) {
            assert.ok(key in dashJson.data, `Missing legacy dashboard-stats key: ${key}`);
        }
        assert.equal(containsPasswordKey(dashJson), false);
    });

    it('applies Asia/Jakarta (+07:00) boundaries accurately across daily, monthly, yearly, and custom periods', async () => {
        // 00:30 WIB on 2030-03-10 is 2030-03-09T17:30:00.000Z in UTC
        const earlyWib = await prisma.financeTransaction.create({
            data: {
                type: 'PEMASUKAN',
                category: 'Lainnya',
                title: 'Midnight WIB Boundary Tx',
                amount: 30000,
                transactionDate: new Date('2030-03-10T00:30:00.000+07:00'),
                createdById: users.admin.id,
                createdByName: 'Admin'
            }
        });
        const lateWib = await prisma.financeTransaction.create({
            data: {
                type: 'PENGELUARAN',
                category: 'Lainnya',
                title: 'Late Night WIB Boundary Tx',
                amount: 10000,
                transactionDate: new Date('2030-03-10T23:30:00.000+07:00'),
                createdById: users.admin.id,
                createdByName: 'Admin'
            }
        });
        createdIds.financeTx.push(earlyWib.id, lateWib.id);

        const prevDayRes = await apiFetch('/api/admin/finance/overview?periodType=daily&date=2030-03-09', {
            token: tokens.admin
        });
        assert.equal(prevDayRes.status, 200);
        assert.equal((await prevDayRes.json()).data.summary.transactionCount, 0);

        for (const qs of [
            'periodType=daily&date=2030-03-10',
            'periodType=monthly&year=2030&month=3',
            'periodType=yearly&year=2030',
            'periodType=custom&startDate=2030-03-10&endDate=2030-03-10'
        ]) {
            const res = await apiFetch(`/api/admin/finance/overview?${qs}`, { token: tokens.manager });
            assert.equal(res.status, 200);
            const { data } = await res.json();
            assert.equal(data.summary.totalPemasukan, 30000, `Failed totalPemasukan for ${qs}`);
            assert.equal(data.summary.totalPengeluaran, 10000, `Failed totalPengeluaran for ${qs}`);
            assert.equal(data.summary.netProfit, 20000, `Failed netProfit for ${qs}`);
        }

        const badDateRes = await apiFetch('/api/admin/finance/overview?periodType=daily&date=2026-02-30', {
            token: tokens.admin
        });
        assert.equal(badDateRes.status, 400);

        const badPeriodRes = await apiFetch('/api/admin/finance/overview?periodType=hourly', {
            token: tokens.admin
        });
        assert.equal(badPeriodRes.status, 400);

        const weeklyRes = await apiFetch('/api/admin/finance/overview?periodType=weekly&date=2030-03-10', {
            token: tokens.admin
        });
        assert.equal(weeklyRes.status, 200);

        // Overview type/source/search filters narrow transactions[] while preserving period summary
        const filteredRes = await apiFetch(
            '/api/admin/finance/overview?periodType=daily&date=2030-03-10&type=PENGELUARAN&source=MANUAL&search=Late',
            { token: tokens.admin }
        );
        assert.equal(filteredRes.status, 200);
        const filteredJson = await filteredRes.json();
        assert.equal(filteredJson.data.summary.totalPemasukan, 30000);
        assert.equal(filteredJson.data.summary.totalPengeluaran, 10000);
        assert.equal(filteredJson.data.transactions.length, 1);
        assert.equal(filteredJson.data.transactions[0].title, 'Late Night WIB Boundary Tx');

        // periodType=all chart buckets must cover future-year transactions (2030)
        const allRes = await apiFetch('/api/admin/finance/overview?periodType=all', { token: tokens.admin });
        assert.equal(allRes.status, 200);
        const allJson = await allRes.json();
        const chartIncomeSum = allJson.data.chartData.reduce((sum, b) => sum + b.pemasukan, 0);
        assert.equal(chartIncomeSum, allJson.data.summary.totalPemasukan);
    });

    it('rejects oversized (>10MB) upload with 400 and blocks /uploads traversal with 403', async () => {
        const bigForm = new FormData();
        bigForm.append('type', 'PENGELUARAN');
        bigForm.append('category', 'Operasional');
        bigForm.append('title', 'Oversized File');
        bigForm.append('amount', '50000');
        bigForm.append('buktiNota', new Blob([Buffer.alloc(10 * 1024 * 1024 + 512, 0x41)], { type: 'image/png' }), 'too-big.png');

        const bigRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.admin,
            method: 'POST',
            body: bigForm
        });
        assert.equal(bigRes.status, 400);

        const rawGetStatus = (rawPath) => new Promise((resolve, reject) => {
            const addr = server.address();
            const req = http.get({ host: '127.0.0.1', port: addr.port, path: rawPath }, (res) => {
                res.resume();
                resolve(res.statusCode);
            });
            req.on('error', reject);
        });

        const traversalStatus = await rawGetStatus('/uploads/%2e%2e/package.json');
        assert.equal(traversalStatus, 403, `Expected 403, got ${traversalStatus}`);

        const malformedStatus = await rawGetStatus('/uploads/%E0%A4%A');
        assert.equal(malformedStatus, 400, `Expected 400, got ${malformedStatus}`);
    });

    it('exports valid corporate PDF with embedded WebP receipt image, PDF notice, and CORS Content-Disposition', async () => {
        const imgForm = new FormData();
        imgForm.append('type', 'PENGELUARAN');
        imgForm.append('category', 'Operasional');
        imgForm.append('title', 'Pembelian Tinta Sablon Plastisol Premium & Obat Afdruk Sablon Screen Printing Workshop FCSV');
        imgForm.append('amount', '210000');
        imgForm.append('transactionDate', '2029-06-20');
        imgForm.append('buktiNota', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'nota-sablon.png');

        const imgRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.admin,
            method: 'POST',
            body: imgForm
        });
        assert.equal(imgRes.status, 201);
        const imgTx = (await imgRes.json()).data;
        createdIds.financeTx.push(imgTx.id);
        trackUploadUrl(imgTx.buktiNotaUrl);

        const pdfForm = new FormData();
        pdfForm.append('type', 'PENGELUARAN');
        pdfForm.append('category', 'Sewa');
        pdfForm.append('title', 'Nota Sewa Gudang PDF');
        pdfForm.append('amount', '400000');
        pdfForm.append('transactionDate', '2029-06-20');
        pdfForm.append('buktiNota', new Blob([VALID_PDF_BUFFER], { type: 'application/pdf' }), 'nota-sewa.pdf');

        const pdfTxRes = await apiFetch('/api/admin/finance/transactions', {
            token: tokens.manager,
            method: 'POST',
            body: pdfForm
        });
        assert.equal(pdfTxRes.status, 201);
        const pdfTx = (await pdfTxRes.json()).data;
        createdIds.financeTx.push(pdfTx.id);
        trackUploadUrl(pdfTx.buktiNotaUrl);

        const exportRes = await apiFetch('/api/admin/finance/export-pdf?periodType=daily&date=2029-06-20', {
            token: tokens.manager,
            headers: { Origin: 'http://localhost:5173' }
        });
        assert.equal(exportRes.status, 200);
        assert.ok((exportRes.headers.get('content-type') || '').includes('application/pdf'));
        assert.equal(
            exportRes.headers.get('content-disposition'),
            'attachment; filename="Laporan_Keuangan_FCSV_harian-2029-06-20.pdf"'
        );
        assert.ok((exportRes.headers.get('access-control-expose-headers') || '').includes('Content-Disposition'));

        const pdfBytes = Buffer.from(await exportRes.arrayBuffer());
        assert.ok(pdfBytes.length > 2048, `Expected PDF > 2KB, got ${pdfBytes.length}`);
        assert.equal(pdfBytes.subarray(0, 5).toString('ascii'), '%PDF-');
        assert.ok(pdfBytes.toString('latin1').trim().endsWith('%%EOF'));

        assert.equal(countPdfPages(pdfBytes), 2, '2029-06-20 receipt PDF must be exactly 2 pages');
        const exportPages = extractPdfPageStreams(pdfBytes);
        assert.equal(exportPages.length, 2);
        assert.ok(exportPages[0].includes('FCSV APPAREL INDONESIA'));
        assert.ok(exportPages[0].includes('Harian - 20 Juni 2029'));
        assert.ok(exportPages[0].includes('Pembelian Tinta Sablon'));
        assert.ok(exportPages[0].includes('FCSV Apparel Indonesia - Dokumen Laporan Keuangan'));
        assert.ok(exportPages[0].includes('Halaman 1 dari 2'));
        assert.ok(exportPages[1].includes('Lampiran Bukti Nota Pengeluaran'));
        assert.ok(exportPages[1].includes('dokumen PDF'));
        assert.ok(exportPages[1].includes('FCSV Apparel Indonesia - Dokumen Laporan Keuangan'));
        assert.ok(exportPages[1].includes('Halaman 2 dari 2'));

        // Empty period export must return exactly 1 page with both content and footer on page 1
        const emptyExportRes = await apiFetch('/api/admin/finance/export-pdf?periodType=daily&date=2035-01-01', {
            token: tokens.admin
        });
        assert.equal(emptyExportRes.status, 200);
        const emptyBytes = Buffer.from(await emptyExportRes.arrayBuffer());
        assert.equal(emptyBytes.subarray(0, 5).toString('ascii'), '%PDF-');
        assert.equal(countPdfPages(emptyBytes), 1, 'Empty-period PDF must be exactly 1 page');
        const emptyPages = extractPdfPageStreams(emptyBytes);
        assert.equal(emptyPages.length, 1);
        assert.ok(emptyPages[0].includes('FCSV APPAREL INDONESIA'));
        assert.ok(emptyPages[0].includes('Tidak ada transaksi pada periode ini'));
        assert.ok(emptyPages[0].includes('FCSV Apparel Indonesia - Dokumen Laporan Keuangan'));
        assert.ok(emptyPages[0].includes('Halaman 1 dari 1'));

        // Multi-page PDF with 35 rows + .webp receipt + .pdf receipt + missing receipt + >90-char title
        const bulkRows = [];
        for (let i = 1; i <= 35; i++) {
            let receiptUrl = null;
            let rowTitle = `Transaksi Uji Halaman #${i} dengan deskripsi cukup panjang untuk membungkus baris`;
            if (i === 1) {
                receiptUrl = imgTx.buktiNotaUrl;
                rowTitle = 'Pembelian Bahan Sublimasi & Kalibrasi Mesin Cetak Tekstil Skala Produksi Panjang Lebih Dari Sembilan Puluh Karakter';
            } else if (i === 2) {
                receiptUrl = pdfTx.buktiNotaUrl;
            } else if (i === 3) {
                receiptUrl = '/uploads/missing-receipt-test-only.webp';
            }
            bulkRows.push({
                type: i <= 3 || i % 2 === 1 ? 'PENGELUARAN' : 'PEMASUKAN',
                category: 'Uji Multi Halaman',
                title: rowTitle,
                description: `Catatan detail ke-${i}`,
                amount: 10000 + i * 100,
                transactionDate: new Date('2031-08-10T10:00:00.000+07:00'),
                buktiNotaUrl: receiptUrl,
                createdById: users.admin.id,
                createdByName: 'Admin'
            });
        }
        await prisma.financeTransaction.createMany({ data: bulkRows });
        const insertedBulk = await prisma.financeTransaction.findMany({
            where: { category: 'Uji Multi Halaman' },
            select: { id: true }
        });
        createdIds.financeTx.push(...insertedBulk.map((r) => r.id));

        const multiPdfRes = await apiFetch('/api/admin/finance/export-pdf?periodType=daily&date=2031-08-10', {
            token: tokens.admin
        });
        assert.equal(multiPdfRes.status, 200);
        const multiBytes = Buffer.from(await multiPdfRes.arrayBuffer());
        assert.equal(multiBytes.subarray(0, 5).toString('ascii'), '%PDF-');
        assert.ok(multiBytes.toString('latin1').trim().endsWith('%%EOF'));

        const multiPageCount = countPdfPages(multiBytes);
        const multiPages = extractPdfPageStreams(multiBytes);
        assert.equal(multiPageCount, 4, `Expected 4 content pages with zero blank overflow pages, got ${multiPageCount}`);
        assert.equal(multiPages.length, 4);
        assert.ok(multiPages[0].includes('FCSV APPAREL INDONESIA'));
        for (let p = 0; p < multiPageCount; p++) {
            assert.ok(
                multiPages[p].includes('FCSV Apparel Indonesia - Dokumen Laporan Keuangan'),
                `Page ${p + 1} missing footer label`
            );
            assert.ok(
                multiPages[p].includes(`Halaman ${p + 1} dari ${multiPageCount}`),
                `Page ${p + 1} missing page number footer`
            );
        }
        const multiReadable = multiPages.join('\n');
        assert.ok(multiReadable.includes('Lampiran Bukti Nota Pengeluaran'));
        assert.ok(multiReadable.includes('dokumen PDF'));
        assert.ok(multiReadable.includes('tidak ditemukan'));
    });
});
