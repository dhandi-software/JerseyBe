const fs = require('fs');
const reportService = require('../services/reportService');
const financeTransactionService = require('../services/financeTransactionService');
const pdfReportService = require('../services/pdfReportService');

const cleanupUploadedFile = (file) => {
    if (!file || !file.path) return;
    try {
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    } catch (err) {
        console.warn(`Failed to clean up uploaded file ${file.path}:`, err.message);
    }
};

const handleError = (res, logPrefix, error, fallbackMessage) => {
    console.error(logPrefix, error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
        success: false,
        status: 'error',
        message: error.message || fallbackMessage
    });
};

const getOverview = async (req, res) => {
    try {
        const data = await reportService.getFinanceOverview(req.query);
        return res.status(200).json({
            success: true,
            status: 'success',
            data
        });
    } catch (error) {
        return handleError(res, 'FINANCE_OVERVIEW_ERROR:', error, 'Gagal mengambil ringkasan keuangan');
    }
};

const listTransactions = async (req, res) => {
    try {
        const data = await financeTransactionService.listTransactions(req.query);
        return res.status(200).json({
            success: true,
            status: 'success',
            data
        });
    } catch (error) {
        return handleError(res, 'FINANCE_LIST_ERROR:', error, 'Gagal mengambil daftar transaksi keuangan');
    }
};

const createTransaction = async (req, res) => {
    try {
        const data = await financeTransactionService.createTransaction(req.body, req.user, req.file);
        return res.status(201).json({
            success: true,
            status: 'success',
            data
        });
    } catch (error) {
        cleanupUploadedFile(req.file);
        return handleError(res, 'FINANCE_CREATE_ERROR:', error, 'Gagal membuat transaksi keuangan');
    }
};

const updateTransaction = async (req, res) => {
    try {
        const data = await financeTransactionService.updateTransaction(req.params.id, req.body, req.file);
        return res.status(200).json({
            success: true,
            status: 'success',
            data
        });
    } catch (error) {
        cleanupUploadedFile(req.file);
        return handleError(res, 'FINANCE_UPDATE_ERROR:', error, 'Gagal memperbarui transaksi keuangan');
    }
};

const deleteTransaction = async (req, res) => {
    try {
        const result = await financeTransactionService.deleteTransaction(req.params.id);
        return res.status(200).json({
            success: true,
            status: 'success',
            message: result.message
        });
    } catch (error) {
        return handleError(res, 'FINANCE_DELETE_ERROR:', error, 'Gagal menghapus transaksi keuangan');
    }
};

const exportPdf = async (req, res) => {
    try {
        const overview = await reportService.getFinanceOverview(req.query);
        const generatedBy = req.user?.staff?.nama || req.user?.username || req.user?.email || 'Admin';
        const pdfBuffer = await pdfReportService.generateFinanceReportPdf(overview, { generatedBy });
        const safeSlug = String(overview.period?.slug || 'laporan').replace(/[^a-zA-Z0-9_-]/g, '');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Laporan_Keuangan_FCSV_${safeSlug}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.status(200).send(pdfBuffer);
    } catch (error) {
        return handleError(res, 'FINANCE_EXPORT_PDF_ERROR:', error, 'Gagal membuat laporan PDF keuangan');
    }
};

module.exports = {
    getOverview,
    listTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    exportPdf
};
