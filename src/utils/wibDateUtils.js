const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_NAMES_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const createBadRequest = (message) => {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
};

const isValidYmd = (value) => {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }
    const utcCheck = new Date(Date.UTC(year, month - 1, day));
    return (
        utcCheck.getUTCFullYear() === year &&
        utcCheck.getUTCMonth() === month - 1 &&
        utcCheck.getUTCDate() === day
    );
};

const toWibShiftedDate = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return new Date(d.getTime() + WIB_OFFSET_MS);
};

const getWibParts = (date = new Date()) => {
    const shifted = toWibShiftedDate(date);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    const hour = shifted.getUTCHours();
    const minute = shifted.getUTCMinutes();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, hour, minute, dateStr };
};

const toWibDateKey = (date) => getWibParts(date).dateStr;

const parseWibDateInput = (value) => {
    if (value === undefined || value === null || value === '') {
        throw createBadRequest('Tanggal transaksi tidak valid');
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw createBadRequest('Format tanggal transaksi tidak valid');
        }
        return new Date(value.getTime());
    }

    if (typeof value !== 'string') {
        throw createBadRequest('Format tanggal transaksi tidak valid');
    }

    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        if (!isValidYmd(trimmed)) {
            throw createBadRequest(`Tanggal transaksi tidak valid: ${trimmed}`);
        }
        // Anchor date-only input to noon WIB so both UTC and WIB resolve to the same calendar day
        return new Date(`${trimmed}T12:00:00.000+07:00`);
    }

    const isoMatch = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(trimmed);
    if (!isoMatch) {
        throw createBadRequest('Format tanggal transaksi tidak valid');
    }

    const [, datePart, hhStr, mmStr, ssStr = '00', fracStr = '', tzPart] = isoMatch;
    if (!isValidYmd(datePart)) {
        throw createBadRequest(`Tanggal transaksi tidak valid: ${datePart}`);
    }

    const hour = Number(hhStr);
    const minute = Number(mmStr);
    const second = Number(ssStr);
    if (hour > 23 || minute > 59 || second > 59) {
        throw createBadRequest('Format waktu transaksi tidak valid');
    }

    if (tzPart && tzPart.toUpperCase() !== 'Z') {
        const [tzH, tzM] = tzPart.slice(1).split(':').map(Number);
        if (tzH > 23 || tzM > 59) {
            throw createBadRequest('Format zona waktu transaksi tidak valid');
        }
    }

    const tz = tzPart ? tzPart.toUpperCase() : '+07:00';
    const parsed = new Date(`${datePart}T${hhStr}:${mmStr}:${ssStr}${fracStr}${tz}`);
    if (Number.isNaN(parsed.getTime())) {
        throw createBadRequest('Format tanggal transaksi tidak valid');
    }
    return parsed;
};

const parseStrictInt = (raw, label, min, max) => {
    const str = String(raw).trim();
    if (!/^\d+$/.test(str)) {
        throw createBadRequest(`${label} harus berupa angka yang valid`);
    }
    const num = Number(str);
    if (num < min || num > max) {
        throw createBadRequest(`${label} harus antara ${min} dan ${max}`);
    }
    return num;
};

const resolvePeriod = (query = {}) => {
    const nowWib = getWibParts();

    let periodType;
    if (query.periodType !== undefined && query.periodType !== '') {
        periodType = String(query.periodType).trim().toLowerCase();
        if (periodType === 'harian') periodType = 'daily';
        if (periodType === 'mingguan') periodType = 'weekly';
        if (periodType === 'bulanan') periodType = 'monthly';
        if (periodType === 'tahunan') periodType = 'yearly';
        if (periodType === 'keseluruhan' || periodType === 'semua' || periodType === 'lifetime') periodType = 'all';
        if (!['daily', 'weekly', 'monthly', 'yearly', 'custom', 'all'].includes(periodType)) {
            throw createBadRequest('Tipe periode tidak valid. Gunakan daily, weekly, monthly, yearly, custom, atau all');
        }
    } else if (query.startDate && query.endDate) {
        periodType = 'custom';
    } else {
        periodType = 'monthly';
    }

    if (periodType === 'daily') {
        const dateStr = query.date ? String(query.date).trim() : nowWib.dateStr;
        if (!isValidYmd(dateStr)) {
            throw createBadRequest('Parameter date harus berformat YYYY-MM-DD yang valid');
        }
        const [y, m, d] = dateStr.split('-').map(Number);
        return {
            periodType,
            date: dateStr,
            month: m,
            year: y,
            startDate: dateStr,
            endDate: dateStr,
            start: new Date(`${dateStr}T00:00:00.000+07:00`),
            end: new Date(`${dateStr}T23:59:59.999+07:00`),
            label: `Harian - ${d} ${MONTH_NAMES_ID[m - 1]} ${y}`,
            slug: `harian-${dateStr}`
        };
    }

    if (periodType === 'weekly') {
        const dateStr = query.date ? String(query.date).trim() : nowWib.dateStr;
        if (!isValidYmd(dateStr)) {
            throw createBadRequest('Parameter date harus berformat YYYY-MM-DD yang valid');
        }
        const [y, m, d] = dateStr.split('-').map(Number);
        const anchorUtc = new Date(Date.UTC(y, m - 1, d));
        const dayOfWeek = anchorUtc.getUTCDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayUtc = new Date(anchorUtc.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
        const sundayUtc = new Date(mondayUtc.getTime() + 6 * 24 * 60 * 60 * 1000);

        const formatYmd = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        const startDate = formatYmd(mondayUtc);
        const endDate = formatYmd(sundayUtc);
        const startLabel = `${mondayUtc.getUTCDate()} ${MONTH_NAMES_SHORT[mondayUtc.getUTCMonth()]}`;
        const endLabel = `${sundayUtc.getUTCDate()} ${MONTH_NAMES_SHORT[sundayUtc.getUTCMonth()]} ${sundayUtc.getUTCFullYear()}`;

        return {
            periodType,
            date: dateStr,
            month: m,
            year: y,
            startDate,
            endDate,
            start: new Date(`${startDate}T00:00:00.000+07:00`),
            end: new Date(`${endDate}T23:59:59.999+07:00`),
            label: `Mingguan - ${startLabel} s/d ${endLabel}`,
            slug: `mingguan-${startDate}_${endDate}`
        };
    }

    if (periodType === 'monthly') {
        const year = query.year !== undefined && query.year !== ''
            ? parseStrictInt(query.year, 'Tahun', 2000, 2100)
            : nowWib.year;
        const month = query.month !== undefined && query.month !== ''
            ? parseStrictInt(query.month, 'Bulan', 1, 12)
            : nowWib.month;
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const mm = String(month).padStart(2, '0');
        const dd = String(lastDay).padStart(2, '0');
        const startDate = `${year}-${mm}-01`;
        const endDate = `${year}-${mm}-${dd}`;
        return {
            periodType,
            date: null,
            month,
            year,
            startDate,
            endDate,
            start: new Date(`${startDate}T00:00:00.000+07:00`),
            end: new Date(`${endDate}T23:59:59.999+07:00`),
            label: `Bulanan - ${MONTH_NAMES_ID[month - 1]} ${year}`,
            slug: `bulanan-${year}-${mm}`
        };
    }

    if (periodType === 'yearly') {
        const year = query.year !== undefined && query.year !== ''
            ? parseStrictInt(query.year, 'Tahun', 2000, 2100)
            : nowWib.year;
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        return {
            periodType,
            date: null,
            month: null,
            year,
            startDate,
            endDate,
            start: new Date(`${startDate}T00:00:00.000+07:00`),
            end: new Date(`${endDate}T23:59:59.999+07:00`),
            label: `Tahunan - ${year}`,
            slug: `tahunan-${year}`
        };
    }

    if (periodType === 'custom') {
        const startDate = query.startDate ? String(query.startDate).trim() : '';
        const endDate = query.endDate ? String(query.endDate).trim() : '';
        if (!isValidYmd(startDate) || !isValidYmd(endDate)) {
            throw createBadRequest('Parameter startDate dan endDate harus berformat YYYY-MM-DD yang valid');
        }
        if (startDate > endDate) {
            throw createBadRequest('Tanggal mulai (startDate) tidak boleh melebihi tanggal akhir (endDate)');
        }
        return {
            periodType,
            date: null,
            month: null,
            year: null,
            startDate,
            endDate,
            start: new Date(`${startDate}T00:00:00.000+07:00`),
            end: new Date(`${endDate}T23:59:59.999+07:00`),
            label: `Periode ${startDate} s/d ${endDate}`,
            slug: `kustom-${startDate}_${endDate}`
        };
    }

    return {
        periodType: 'all',
        date: null,
        month: null,
        year: null,
        startDate: null,
        endDate: null,
        start: null,
        end: null,
        label: 'Keseluruhan (Semua Periode)',
        slug: 'keseluruhan'
    };
};

const formatWibDate = (date) => {
    const { year, month, day } = getWibParts(date);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
};

const formatWibDateTime = (date = new Date()) => {
    const { year, month, day, hour, minute } = getWibParts(date);
    const dd = String(day).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const min = String(minute).padStart(2, '0');
    return `${dd} ${MONTH_NAMES_SHORT[month - 1]} ${year} ${hh}:${min} WIB`;
};

module.exports = {
    WIB_OFFSET_MS,
    DAY_NAMES_SHORT,
    MONTH_NAMES_SHORT,
    MONTH_NAMES_ID,
    isValidYmd,
    toWibShiftedDate,
    getWibParts,
    toWibDateKey,
    parseWibDateInput,
    resolvePeriod,
    formatWibDate,
    formatWibDateTime
};
