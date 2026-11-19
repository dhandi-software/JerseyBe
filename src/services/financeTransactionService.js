const fs = require('fs');
const path = require('path');
const financeTransactionRepository = require('../repositories/financeTransactionRepository');
const { parseWibDateInput, resolvePeriod, toWibDateKey } = require('../utils/wibDateUtils');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const ALLOWED_TYPES = new Set(['PEMASUKAN', 'PENGELUARAN']);

const createHttpError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

const parsePositiveId = (rawId) => {
    const str = String(rawId || '').trim();
    if (!/^\d+$/.test(str)) {
        throw createHttpError(400, 'ID transaksi tidak valid');
    }
    const id = Number(str);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw createHttpError(400, 'ID transaksi tidak valid');
    }
    return id;
};

const normalizeType = (rawType) => {
    const normalized = typeof rawType === 'string' ? rawType.trim().toUpperCase() : '';
    if (!ALLOWED_TYPES.has(normalized)) {
        throw createHttpError(400, 'Jenis transaksi harus PEMASUKAN atau PENGELUARAN');
    }
    return normalized;
};

const normalizeRequiredText = (raw, label) => {
    if (typeof raw !== 'string' || !raw.trim()) {
        throw createHttpError(400, `${label} wajib diisi`);
    }
    return raw.trim();
};

const normalizeOptionalText = (raw) => {
    if (raw === undefined || raw === null) return null;
    const trimmed = String(raw).trim();
    return trimmed ? trimmed : null;
};

const normalizeAmount = (rawAmount) => {
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        throw createHttpError(400, 'Nominal transaksi wajib diisi');
    }
    if (typeof rawAmount !== 'number' && typeof rawAmount !== 'string') {
        throw createHttpError(400, 'Nominal transaksi harus berupa angka yang valid');
    }
    if (typeof rawAmount === 'string' && !rawAmount.trim()) {
        throw createHttpError(400, 'Nominal transaksi wajib diisi');
    }
    const num = Number(rawAmount);
    if (!Number.isFinite(num) || num <= 0) {
        throw createHttpError(400, 'Nominal transaksi harus lebih besar dari 0');
    }
    return num;
};

const resolveActorName = (user) => {
    return user?.staff?.nama || user?.username || user?.email || 'Admin';
};

const safeUnlinkReceipt = async (receiptUrl, excludeTxId = null) => {
    if (typeof receiptUrl !== 'string' || !receiptUrl.startsWith('/uploads/')) {
        return;
    }
    const relativeName = receiptUrl.slice('/uploads/'.length).split(/[?#]/)[0];
    if (!relativeName) return;

    const absPath = path.resolve(UPLOADS_DIR, relativeName);
    if (absPath === UPLOADS_DIR || !absPath.startsWith(UPLOADS_DIR + path.sep)) {
        return;
    }

    const refCount = await financeTransactionRepository.countByReceiptUrl(receiptUrl, excludeTxId);
    if (refCount > 0) return;

    try {
        if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
        }
    } catch (err) {
        console.warn(`Failed to unlink receipt ${absPath}:`, err.message);
    }
};

const formatTransaction = (row) => {
    if (!row) return null;
    return {
        id: row.id,
        transactionCode: row.transactionCode,
        type: row.type,
        category: row.category,
        title: row.title,
        description: row.description || null,
        amount: row.amount,
        transactionDate: row.transactionDate,
        dateWib: toWibDateKey(row.transactionDate),
        paymentMethod: row.paymentMethod || null,
        buktiNotaUrl: row.buktiNotaUrl || null,
        createdById: row.createdById || null,
        createdByName: row.createdByName || row.createdBy?.staff?.nama || row.createdBy?.username || 'Admin',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
};

const listTransactions = async (query = {}) => {
    const period = resolvePeriod(query);
    let typeFilter = 'ALL';
    if (query.type && String(query.type).trim().toUpperCase() !== 'ALL') {
        typeFilter = normalizeType(query.type);
    }

    const rows = await financeTransactionRepository.findMany({
        start: period.start,
        end: period.end,
        type: typeFilter,
        search: query.search
    });

    return rows.map(formatTransaction);
};

const createTransaction = async (payload = {}, user = null, file = null) => {
    const type = normalizeType(payload.type);
    const category = normalizeRequiredText(payload.category, 'Kategori transaksi');
    const title = normalizeRequiredText(payload.title, 'Judul transaksi');
    const amount = normalizeAmount(payload.amount);
    const transactionDate = payload.transactionDate !== undefined && payload.transactionDate !== ''
        ? parseWibDateInput(payload.transactionDate)
        : new Date();
    const paymentMethod = normalizeOptionalText(payload.paymentMethod) || 'TRANSFER';
    const description = normalizeOptionalText(payload.description);
    const buktiNotaUrl = file ? `/uploads/${file.filename}` : null;

    const created = await financeTransactionRepository.create({
        type,
        category,
        title,
        description,
        amount,
        transactionDate,
        paymentMethod,
        buktiNotaUrl,
        createdById: user?.id || null,
        createdByName: resolveActorName(user)
    });

    return formatTransaction(created);
};

const updateTransaction = async (id, payload = {}, file = null) => {
    const parsedId = parsePositiveId(id);
    const existing = await financeTransactionRepository.findById(parsedId);
    if (!existing) {
        throw createHttpError(404, 'Transaksi keuangan tidak ditemukan');
    }

    const updateData = {};

    if (payload.type !== undefined) {
        updateData.type = normalizeType(payload.type);
    }
    if (payload.category !== undefined) {
        updateData.category = normalizeRequiredText(payload.category, 'Kategori transaksi');
    }
    if (payload.title !== undefined) {
        updateData.title = normalizeRequiredText(payload.title, 'Judul transaksi');
    }
    if (payload.description !== undefined) {
        updateData.description = normalizeOptionalText(payload.description);
    }
    if (payload.amount !== undefined) {
        updateData.amount = normalizeAmount(payload.amount);
    }
    if (payload.transactionDate !== undefined && payload.transactionDate !== '') {
        updateData.transactionDate = parseWibDateInput(payload.transactionDate);
    }
    if (payload.paymentMethod !== undefined) {
        updateData.paymentMethod = normalizeOptionalText(payload.paymentMethod);
    }

    const wantsRemoveReceipt = payload.removeReceipt === true || payload.removeReceipt === 'true';
    if (file) {
        updateData.buktiNotaUrl = `/uploads/${file.filename}`;
    } else if (wantsRemoveReceipt) {
        updateData.buktiNotaUrl = null;
    }

    const updated = await financeTransactionRepository.update(parsedId, updateData);

    const receiptChanged = updateData.buktiNotaUrl !== undefined && existing.buktiNotaUrl !== updateData.buktiNotaUrl;
    if (receiptChanged && existing.buktiNotaUrl) {
        await safeUnlinkReceipt(existing.buktiNotaUrl, parsedId);
    }

    return formatTransaction(updated);
};

const deleteTransaction = async (id) => {
    const parsedId = parsePositiveId(id);
    const existing = await financeTransactionRepository.findById(parsedId);
    if (!existing) {
        throw createHttpError(404, 'Transaksi keuangan tidak ditemukan');
    }

    await financeTransactionRepository.deleteById(parsedId);

    if (existing.buktiNotaUrl) {
        await safeUnlinkReceipt(existing.buktiNotaUrl, parsedId);
    }

    return { message: 'Transaksi berhasil dihapus' };
};

module.exports = {
    listTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction
};
