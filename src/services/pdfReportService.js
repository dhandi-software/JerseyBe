const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { formatWibDate, formatWibDateTime } = require('../utils/wibDateUtils');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const LOGO_CANDIDATES = [
    path.resolve(__dirname, '../assets/fcsv-logo.png'),
    path.resolve(__dirname, '../../../FCSV_FE/public/images/FCSV.png')
];

const COMPANY = {
    name: 'FCSV APPAREL INDONESIA',
    subtitle: 'Divisi Produksi & Keuangan',
    address: 'Jl. Raya Cikande Kopo, Kp. Padaharan, Ds. Rancasumur RT 001/RW 001, Kec. Kopo, Kab. Serang, Banten 42178',
    contact: '+62 858-9272-0034 | support@fcsvjersey.id'
};

const PALETTE = {
    bannerBg: '#0F172A',
    navyText: '#1E293B',
    accent: '#D25026',
    income: '#059669',
    expense: '#DC2626',
    muted: '#64748B',
    body: '#334155',
    border: '#E2E8F0',
    surface: '#F8FAFC',
    white: '#FFFFFF'
};

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // 515.28 pt on A4
const SAFE_BOTTOM_Y = 780;

const sanitizePdfText = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\u0000-\u001F\u007F]|[^\u0020-\u00FF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const formatRupiah = (amount) => {
    const num = Math.round(Number(amount) || 0);
    const absStr = Math.abs(num).toLocaleString('id-ID');
    return num < 0 ? `-Rp ${absStr}` : `Rp ${absStr}`;
};

const SOURCE_LABELS = {
    ORDER: 'Pesanan',
    BAHAN_BAKU: 'Bahan Baku',
    MANUAL: 'Manual'
};

const loadLogoBuffer = () => {
    for (const candidate of LOGO_CANDIDATES) {
        try {
            if (fs.existsSync(candidate)) {
                return fs.readFileSync(candidate);
            }
        } catch {
            // Try next fallback candidate
        }
    }
    return null;
};

const resolveUploadPath = (url) => {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
    const rel = url.slice('/uploads/'.length).split(/[?#]/)[0];
    if (!rel) return null;

    const abs = path.resolve(UPLOADS_DIR, rel);
    if (abs === UPLOADS_DIR || !abs.startsWith(UPLOADS_DIR + path.sep)) return null;

    if (fs.existsSync(abs)) return abs;

    const ext = path.extname(abs).toLowerCase();
    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        const webpSibling = abs.slice(0, -ext.length) + '.webp';
        if (fs.existsSync(webpSibling)) return webpSibling;
    }
    return null;
};

const drawBannerHeader = (doc, periodLabel, printedAtText, generatedBy, logoBuffer) => {
    let textStartX = PAGE_MARGIN;
    if (logoBuffer) {
        textStartX = PAGE_MARGIN + 104;
    } else {
        textStartX = PAGE_MARGIN + 62;
    }

    const rightColW = 185;
    const rightX = PAGE_MARGIN + CONTENT_WIDTH - rightColW;
    const leftColW = Math.max(180, rightX - textStartX - 12);

    const periodText = sanitizePdfText(periodLabel);
    const printedText = `Dicetak: ${sanitizePdfText(printedAtText)}`;
    const actorText = generatedBy ? `Oleh: ${sanitizePdfText(generatedBy)}` : '';

    doc.font('Helvetica-Bold').fontSize(8.5);
    const periodH = doc.heightOfString(periodText, { width: rightColW });
    doc.font('Helvetica').fontSize(7.5);
    const printedH = doc.heightOfString(printedText, { width: rightColW });
    const actorH = actorText ? doc.heightOfString(actorText, { width: rightColW }) : 0;

    const rightTitleY = 14;
    const rightPeriodY = rightTitleY + 15;
    const rightPrintedY = rightPeriodY + periodH + 3;
    const rightActorY = rightPrintedY + printedH + 2;
    const rightBottomY = actorText ? rightActorY + actorH : rightPrintedY + printedH;

    doc.font('Helvetica').fontSize(7.5);
    const addrH = doc.heightOfString(COMPANY.address, { width: leftColW });
    const contactY = Math.max(60, 40 + addrH + 2);
    const leftBottomY = contactY + 10;

    const bannerH = Math.max(82, Math.ceil(Math.max(rightBottomY, leftBottomY) + 10));

    doc.rect(0, 0, doc.page.width, bannerH).fill(PALETTE.bannerBg);
    doc.rect(0, bannerH, doc.page.width, 3).fill(PALETTE.accent);

    let drawnLogo = false;
    if (logoBuffer) {
        try {
            doc.image(logoBuffer, PAGE_MARGIN, 18, { width: 92 });
            drawnLogo = true;
        } catch {
            drawnLogo = false;
        }
    }

    if (!drawnLogo) {
        doc.fillColor(PALETTE.white).font('Helvetica-Bold').fontSize(15)
            .text('FCSV', PAGE_MARGIN, 20, { width: 60 });
        textStartX = PAGE_MARGIN + 62;
    }

    doc.fillColor(PALETTE.white).font('Helvetica-Bold').fontSize(12)
        .text(COMPANY.name, textStartX, 15, { width: leftColW });
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(7.5)
        .text(COMPANY.subtitle, textStartX, 30, { width: leftColW })
        .text(COMPANY.address, textStartX, 40, { width: leftColW })
        .text(COMPANY.contact, textStartX, contactY, { width: leftColW });

    doc.fillColor(PALETTE.accent).font('Helvetica-Bold').fontSize(10.5)
        .text('LAPORAN KEUANGAN', rightX, rightTitleY, { width: rightColW, align: 'right' });
    doc.fillColor(PALETTE.white).font('Helvetica-Bold').fontSize(8.5)
        .text(periodText, rightX, rightPeriodY, { width: rightColW, align: 'right' });
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(7.5)
        .text(printedText, rightX, rightPrintedY, { width: rightColW, align: 'right' });
    if (actorText) {
        doc.text(actorText, rightX, rightActorY, { width: rightColW, align: 'right' });
    }

    doc.y = bannerH + 18;
};

const drawContinuationHeader = (doc, periodLabel) => {
    doc.rect(PAGE_MARGIN, 24, CONTENT_WIDTH, 20).fill(PALETTE.surface);
    doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(8.5)
        .text(`${COMPANY.name} - Laporan Keuangan (${sanitizePdfText(periodLabel)})`, PAGE_MARGIN + 8, 30, {
            width: CONTENT_WIDTH - 16
        });
    doc.moveTo(PAGE_MARGIN, 46).lineTo(PAGE_MARGIN + CONTENT_WIDTH, 46).strokeColor(PALETTE.border).lineWidth(0.75).stroke();
    doc.y = 54;
};

const drawKpiAndBreakdown = (doc, summary) => {
    const startY = doc.y;
    const gap = 8;
    const cardW = (CONTENT_WIDTH - gap * 2) / 3;
    const cardH = 62;

    const netColor = summary.netProfit >= 0 ? PALETTE.income : PALETTE.expense;
    const marginPct = summary.totalPemasukan > 0
        ? `${((summary.netProfit / summary.totalPemasukan) * 100).toFixed(1)}% margin bersih`
        : 'Belum ada pemasukan';

    const cards = [
        {
            title: 'TOTAL PEMASUKAN',
            value: formatRupiah(summary.totalPemasukan),
            sub: `${summary.pemasukanCount} transaksi`,
            accent: PALETTE.income
        },
        {
            title: 'TOTAL PENGELUARAN',
            value: formatRupiah(summary.totalPengeluaran),
            sub: `${summary.pengeluaranCount} transaksi`,
            accent: PALETTE.expense
        },
        {
            title: 'HASIL BERSIH (NET)',
            value: formatRupiah(summary.netProfit),
            sub: marginPct,
            accent: netColor
        }
    ];

    cards.forEach((card, idx) => {
        const x = PAGE_MARGIN + idx * (cardW + gap);
        doc.roundedRect(x, startY, cardW, cardH, 4).fillAndStroke(PALETTE.surface, PALETTE.border);
        doc.rect(x, startY, cardW, 3).fill(card.accent);

        doc.fillColor(PALETTE.muted).font('Helvetica-Bold').fontSize(7.5)
            .text(card.title, x + 10, startY + 11, { width: cardW - 20 });
        doc.fillColor(card.accent).font('Helvetica-Bold').fontSize(12.5)
            .text(card.value, x + 10, startY + 24, { width: cardW - 20 });
        doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(7.5)
            .text(card.sub, x + 10, startY + 43, { width: cardW - 20 });
    });

    const stripY = startY + cardH + 10;
    const halfW = (CONTENT_WIDTH - 8) / 2;
    const stripH = 44;

    doc.roundedRect(PAGE_MARGIN, stripY, halfW, stripH, 4).fillAndStroke(PALETTE.white, PALETTE.border);
    doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(8)
        .text('Rincian Sumber Pemasukan', PAGE_MARGIN + 10, stripY + 7);
    doc.fillColor(PALETTE.body).font('Helvetica').fontSize(7.8)
        .text(`Pesanan Jersey: ${formatRupiah(summary.orderPemasukan)}`, PAGE_MARGIN + 10, stripY + 19)
        .text(`Pemasukan Manual: ${formatRupiah(summary.manualPemasukan)}`, PAGE_MARGIN + 10, stripY + 30);

    const rightBoxX = PAGE_MARGIN + halfW + 8;
    doc.roundedRect(rightBoxX, stripY, halfW, stripH, 4).fillAndStroke(PALETTE.white, PALETTE.border);
    doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(8)
        .text('Rincian Sumber Pengeluaran', rightBoxX + 10, stripY + 7);
    doc.fillColor(PALETTE.body).font('Helvetica').fontSize(7.8)
        .text(`Pembelian Bahan Baku: ${formatRupiah(summary.bahanPengeluaran)}`, rightBoxX + 10, stripY + 19)
        .text(`Pengeluaran Manual: ${formatRupiah(summary.manualPengeluaran)}`, rightBoxX + 10, stripY + 30);

    doc.y = stripY + stripH + 16;
};

const TABLE_COLS = [
    { key: 'no', label: 'No', width: 26, align: 'center' },
    { key: 'date', label: 'Tanggal', width: 64, align: 'left' },
    { key: 'source', label: 'Sumber', width: 64, align: 'left' },
    { key: 'detail', label: 'Kategori & Keterangan', width: 191.28, align: 'left' },
    { key: 'type', label: 'Jenis', width: 68, align: 'center' },
    { key: 'amount', label: 'Nominal', width: 102, align: 'right' }
];

const drawTableHeader = (doc, y) => {
    const headerH = 22;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, headerH).fill(PALETTE.bannerBg);
    let x = PAGE_MARGIN;
    doc.fillColor(PALETTE.white).font('Helvetica-Bold').fontSize(8);
    TABLE_COLS.forEach((col) => {
        doc.text(col.label, x + 5, y + 7, { width: col.width - 10, align: col.align });
        x += col.width;
    });
    return y + headerH;
};

const drawTransactionTable = (doc, transactions, periodLabel) => {
    doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(10.5)
        .text('Rincian Transaksi Keuangan', PAGE_MARGIN, doc.y);
    doc.y += 6;

    if (!transactions.length) {
        const boxY = doc.y;
        doc.roundedRect(PAGE_MARGIN, boxY, CONTENT_WIDTH, 38, 4).fillAndStroke(PALETTE.surface, PALETTE.border);
        doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(9)
            .text('Tidak ada transaksi pada periode ini.', PAGE_MARGIN, boxY + 14, {
                width: CONTENT_WIDTH,
                align: 'center'
            });
        doc.y = boxY + 48;
        return;
    }

    let cursorY = drawTableHeader(doc, doc.y);

    transactions.forEach((tx, idx) => {
        const titleText = sanitizePdfText(tx.title || '-');
        const metaParts = [sanitizePdfText(tx.category)];
        if (tx.description) metaParts.push(sanitizePdfText(tx.description));
        if (tx.actorName) metaParts.push(`Oleh: ${sanitizePdfText(tx.actorName)}`);
        const metaText = metaParts.filter(Boolean).join(' - ');

        const detailWidth = TABLE_COLS[3].width - 10;
        doc.font('Helvetica-Bold').fontSize(8);
        const titleH = doc.heightOfString(titleText, { width: detailWidth });
        doc.font('Helvetica').fontSize(7);
        const metaH = metaText ? doc.heightOfString(metaText, { width: detailWidth }) : 0;
        const rowH = Math.max(24, Math.ceil(titleH + (metaH ? metaH + 2 : 0) + 10));

        if (cursorY + rowH > SAFE_BOTTOM_Y) {
            doc.addPage();
            drawContinuationHeader(doc, periodLabel);
            cursorY = drawTableHeader(doc, doc.y);
        }

        const bg = idx % 2 === 1 ? PALETTE.surface : PALETTE.white;
        doc.rect(PAGE_MARGIN, cursorY, CONTENT_WIDTH, rowH).fill(bg);
        doc.moveTo(PAGE_MARGIN, cursorY + rowH).lineTo(PAGE_MARGIN + CONTENT_WIDTH, cursorY + rowH)
            .strokeColor(PALETTE.border).lineWidth(0.5).stroke();

        const isIncome = tx.type === 'PEMASUKAN';
        const amountStr = `${isIncome ? '+' : '-'} ${formatRupiah(tx.amount)}`;
        const rowTop = cursorY + 5;

        let x = PAGE_MARGIN;
        doc.fillColor(PALETTE.body).font('Helvetica').fontSize(8)
            .text(String(idx + 1), x + 5, rowTop, { width: TABLE_COLS[0].width - 10, align: 'center' });
        x += TABLE_COLS[0].width;

        doc.text(formatWibDate(tx.transactionDate), x + 5, rowTop, { width: TABLE_COLS[1].width - 10 });
        x += TABLE_COLS[1].width;

        doc.text(SOURCE_LABELS[tx.source] || tx.source, x + 5, rowTop, { width: TABLE_COLS[2].width - 10 });
        x += TABLE_COLS[2].width;

        doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(8)
            .text(titleText, x + 5, rowTop, { width: detailWidth });
        if (metaText) {
            doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(7)
                .text(metaText, x + 5, rowTop + titleH + 2, { width: detailWidth });
        }
        x += TABLE_COLS[3].width;

        doc.fillColor(isIncome ? PALETTE.income : PALETTE.expense).font('Helvetica-Bold').fontSize(7.5)
            .text(isIncome ? 'Pemasukan' : 'Pengeluaran', x + 5, rowTop, {
                width: TABLE_COLS[4].width - 10,
                align: 'center'
            });
        x += TABLE_COLS[4].width;

        doc.fillColor(isIncome ? PALETTE.income : PALETTE.expense).font('Helvetica-Bold').fontSize(8)
            .text(amountStr, x + 5, rowTop, { width: TABLE_COLS[5].width - 10, align: 'right' });

        cursorY += rowH;
    });

    doc.y = cursorY + 16;
};

const prepareReceiptAsset = async (url) => {
    const resolvedPath = resolveUploadPath(url);
    const fileName = sanitizePdfText(path.basename(String(url || '').split(/[?#]/)[0]) || 'lampiran');

    if (!resolvedPath) {
        return { kind: 'missing', fileName };
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext === '.pdf') {
        return { kind: 'pdf', fileName };
    }

    try {
        // Read file into Buffer first so libvips does not hold an mmap lock on Windows
        const inputBuffer = await fs.promises.readFile(resolvedPath);
        // pdfkit only supports PNG/JPEG buffers; convert WebP and other raster uploads in memory
        const jpegBuffer = await sharp(inputBuffer)
            .rotate()
            .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        return { kind: 'image', fileName, buffer: jpegBuffer };
    } catch {
        return { kind: 'missing', fileName };
    }
};

const drawExpenseReceiptsSection = async (doc, transactions, periodLabel) => {
    const expenseReceipts = transactions.filter((tx) => tx.type === 'PENGELUARAN' && tx.buktiNotaUrl);

    if (!expenseReceipts.length) {
        if (doc.y + 46 > SAFE_BOTTOM_Y) {
            doc.addPage();
            drawContinuationHeader(doc, periodLabel);
        }
        doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(10.5)
            .text('Lampiran Bukti Nota Pengeluaran', PAGE_MARGIN, doc.y);
        doc.y += 6;
        doc.roundedRect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 32, 4).fillAndStroke(PALETTE.surface, PALETTE.border);
        doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(8.5)
            .text('Tidak ada lampiran bukti nota pengeluaran pada periode ini.', PAGE_MARGIN, doc.y + 11, {
                width: CONTENT_WIDTH,
                align: 'center'
            });
        return;
    }

    const preparedAssets = await Promise.all(
        expenseReceipts.map(async (tx) => ({
            tx,
            asset: await prepareReceiptAsset(tx.buktiNotaUrl)
        }))
    );

    doc.addPage();
    drawContinuationHeader(doc, periodLabel);
    doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(11)
        .text('Lampiran Bukti Nota Pengeluaran', PAGE_MARGIN, doc.y);
    doc.y += 10;

    for (let i = 0; i < preparedAssets.length; i++) {
        const { tx, asset } = preparedAssets[i];
        const headerTitle = `#${i + 1} | ${formatWibDate(tx.transactionDate)} | ${SOURCE_LABELS[tx.source] || tx.source} - ${sanitizePdfText(tx.title)}`;
        const titleW = CONTENT_WIDTH - 130;
        const titleH = Math.ceil(doc.font('Helvetica-Bold').fontSize(8.5).heightOfString(headerTitle, { width: titleW }));
        const fileLabel = `File: ${asset.fileName}`;
        const fileH = Math.ceil(doc.font('Helvetica').fontSize(7.2).heightOfString(fileLabel, { width: CONTENT_WIDTH - 20 }));

        const fileOffset = 6 + Math.max(12, titleH) + 3;
        const headerH = Math.max(34, fileOffset + Math.max(12, fileH) + 4);
        const bodyH = asset.kind === 'image' ? 235 : 34;
        const cardH = headerH + 8 + bodyH + 8;

        if (doc.y + cardH > SAFE_BOTTOM_Y) {
            doc.addPage();
            drawContinuationHeader(doc, periodLabel);
        }

        const cardY = doc.y;
        const fileY = cardY + fileOffset;
        const bodyY = cardY + headerH + 8;

        doc.roundedRect(PAGE_MARGIN, cardY, CONTENT_WIDTH, cardH, 4).fillAndStroke(PALETTE.white, PALETTE.border);
        doc.rect(PAGE_MARGIN, cardY, CONTENT_WIDTH, headerH).fill(PALETTE.surface);

        doc.fillColor(PALETTE.navyText).font('Helvetica-Bold').fontSize(8.5)
            .text(headerTitle, PAGE_MARGIN + 10, cardY + 6, { width: titleW });
        doc.fillColor(PALETTE.expense).font('Helvetica-Bold').fontSize(8.5)
            .text(formatRupiah(tx.amount), PAGE_MARGIN + CONTENT_WIDTH - 120, cardY + 6, {
                width: 110,
                align: 'right'
            });
        doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(7.2)
            .text(fileLabel, PAGE_MARGIN + 10, fileY, { width: CONTENT_WIDTH - 20 });

        if (asset.kind === 'image') {
            try {
                doc.image(asset.buffer, PAGE_MARGIN + 16, bodyY, {
                    fit: [CONTENT_WIDTH - 32, 232],
                    align: 'center',
                    valign: 'center'
                });
            } catch {
                doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(8.5)
                    .text(`File bukti nota tidak dapat dimuat (${asset.fileName}).`, PAGE_MARGIN + 14, bodyY + 10, {
                        width: CONTENT_WIDTH - 28
                    });
            }
        } else if (asset.kind === 'pdf') {
            doc.roundedRect(PAGE_MARGIN + 12, bodyY, CONTENT_WIDTH - 24, 34, 3).fillAndStroke('#F1F5F9', PALETTE.border);
            doc.fillColor(PALETTE.body).font('Helvetica').fontSize(8)
                .text(`Lampiran berbentuk dokumen PDF (${asset.fileName}). Silakan buka langsung melalui aplikasi web.`,
                    PAGE_MARGIN + 20, bodyY + 11, { width: CONTENT_WIDTH - 40 });
        } else {
            doc.roundedRect(PAGE_MARGIN + 12, bodyY, CONTENT_WIDTH - 24, 34, 3).fillAndStroke('#FEF2F2', '#FECACA');
            doc.fillColor(PALETTE.expense).font('Helvetica').fontSize(8)
                .text(`File bukti nota tidak ditemukan atau tidak dapat diproses (${asset.fileName}).`,
                    PAGE_MARGIN + 20, bodyY + 11, { width: CONTENT_WIDTH - 40 });
        }

        doc.y = cardY + cardH + 12;
    }
};

const drawRunningFooters = (doc) => {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        // Zero bottom margin temporarily so footer text below maxY() does not trigger PDFKit auto-pagination
        const prevBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        try {
            const lineY = doc.page.height - 42;
            const textY = doc.page.height - 33;

            doc.moveTo(PAGE_MARGIN, lineY).lineTo(PAGE_MARGIN + CONTENT_WIDTH, lineY)
                .strokeColor(PALETTE.border).lineWidth(0.6).stroke();

            doc.fillColor(PALETTE.muted).font('Helvetica').fontSize(7.5)
                .text('FCSV Apparel Indonesia - Dokumen Laporan Keuangan', PAGE_MARGIN, textY, {
                    width: 340,
                    lineBreak: false
                });
            doc.text(`Halaman ${i + 1} dari ${range.count}`, PAGE_MARGIN + CONTENT_WIDTH - 150, textY, {
                width: 150,
                align: 'right',
                lineBreak: false
            });
        } finally {
            doc.page.margins.bottom = prevBottom;
        }
    }
};

const generateFinanceReportPdf = async (overviewData, { generatedBy } = {}) => {
    const logoBuffer = loadLogoBuffer();
    const periodLabel = overviewData?.period?.label || 'Semua Periode';
    const printedAt = formatWibDateTime(new Date());

    const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE_MARGIN,
        bufferPages: true,
        info: {
            Title: sanitizePdfText(`Laporan Keuangan FCSV - ${periodLabel}`),
            Author: 'FCSV Apparel Indonesia',
            Subject: 'Laporan Keuangan Perusahaan'
        }
    });

    const chunks = [];
    const pdfPromise = new Promise((resolve, reject) => {
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    drawBannerHeader(doc, periodLabel, printedAt, generatedBy, logoBuffer);
    drawKpiAndBreakdown(doc, overviewData.summary);
    drawTransactionTable(doc, overviewData.transactions || [], periodLabel);
    await drawExpenseReceiptsSection(doc, overviewData.transactions || [], periodLabel);
    drawRunningFooters(doc);

    doc.end();
    return pdfPromise;
};

module.exports = {
    generateFinanceReportPdf,
    sanitizePdfText
};
