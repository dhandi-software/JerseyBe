const bahanBajuRepository = require('../repositories/bahanBajuRepository');

const getAllBahan = async () => {
    return await bahanBajuRepository.findAllBahan();
};

const getHistory = async () => {
    return await bahanBajuRepository.findHistory({}, { bahan: true }, { createdAt: 'desc' });
};

const getReturBahan = async () => {
    return await bahanBajuRepository.findHistory({
        OR: [
            { keterangan: { contains: 'rusak', mode: 'insensitive' } },
            { keterangan: { contains: 'reject', mode: 'insensitive' } }
        ]
    }, { bahan: true }, { createdAt: 'desc' });
};

const createBahan = async ({ nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, hargaBeli, actor, customerName, imageUrl, buktiNotaUrl }) => {
    const parsedKuantitas = parseFloat(kuantitasKg);
    const finalKuantitas = isNaN(parsedKuantitas) ? 0 : parsedKuantitas;

    const parsedRasio = parseFloat(rasioKonversi);
    const finalRasio = isNaN(parsedRasio) ? 1.0 : parsedRasio;

    const finalStatus = status || 'Tersedia';

    const parsedHarga = parseFloat(harga);
    const finalHarga = isNaN(parsedHarga) ? 0 : parsedHarga;

    const parsedHargaBeli = parseFloat(hargaBeli);
    const finalHargaBeli = isNaN(parsedHargaBeli) ? 0 : parsedHargaBeli;

    const newBahan = await bahanBajuRepository.createBahan({
        nama,
        deskripsi,
        kuantitasKg: finalKuantitas,
        rasioKonversi: finalRasio,
        status: finalStatus,
        harga: finalHarga,
        hargaBeli: finalHargaBeli,
        imageUrl,
        buktiNotaUrl
    });

    await bahanBajuRepository.createHistory({
        bahanId: newBahan.id,
        namaBahan: newBahan.nama,
        aksi: 'BUAT',
        jumlah: newBahan.kuantitasKg,
        stokAkhir: newBahan.kuantitasKg,
        hargaBeli: newBahan.hargaBeli,
        hargaJual: newBahan.harga,
        totalNilai: newBahan.hargaBeli || 0,
        keterangan: 'Bahan baju baru ditambahkan',
        actor: actor || 'System',
        customerName: customerName || actor || 'Tim Internal',
        buktiNotaUrl: newBahan.buktiNotaUrl || null
    });

    return newBahan;
};

const updateBahan = async (id, { nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, hargaBeli, keterangan_ubah, deleteImage, deleteBuktiNota, actor, customerName, newUploadedImageUrl, newUploadedBuktiNotaUrl }) => {
    const existingBahan = await bahanBajuRepository.findBahanById(id);
    if (!existingBahan) {
        const error = new Error('Not found');
        error.statusCode = 404;
        throw error;
    }

    const parsedKuantitas = parseFloat(kuantitasKg);
    const updatedKuantitas = isNaN(parsedKuantitas) ? existingBahan.kuantitasKg : parsedKuantitas;

    const parsedRasio = parseFloat(rasioKonversi);
    const updatedRasio = isNaN(parsedRasio) ? existingBahan.rasioKonversi : parsedRasio;

    const updatedStatus = status || existingBahan.status || 'Tersedia';

    const parsedHarga = parseFloat(harga);
    const updatedHarga = isNaN(parsedHarga) ? existingBahan.harga : parsedHarga;

    const parsedHargaBeli = parseFloat(hargaBeli);
    const updatedHargaBeli = isNaN(parsedHargaBeli) ? (existingBahan.hargaBeli || 0) : parsedHargaBeli;

    const selisih = updatedKuantitas - existingBahan.kuantitasKg;

    let newImageUrl = existingBahan.imageUrl;
    if (newUploadedImageUrl) {
        newImageUrl = newUploadedImageUrl;
    } else if (deleteImage === 'true') {
        newImageUrl = null;
    }

    let newBuktiNotaUrl = existingBahan.buktiNotaUrl;
    if (newUploadedBuktiNotaUrl) {
        newBuktiNotaUrl = newUploadedBuktiNotaUrl;
    } else if (deleteBuktiNota === 'true') {
        newBuktiNotaUrl = null;
    }

    const updatedBahan = await bahanBajuRepository.updateBahan(id, {
        nama,
        deskripsi,
        kuantitasKg: updatedKuantitas,
        rasioKonversi: updatedRasio,
        status: updatedStatus,
        harga: updatedHarga,
        hargaBeli: updatedHargaBeli,
        imageUrl: newImageUrl,
        buktiNotaUrl: newBuktiNotaUrl
    });

    if (selisih !== 0) {
        const isTambah = selisih > 0;
        const absSelisih = Math.abs(selisih);
        await bahanBajuRepository.createHistory({
            bahanId: existingBahan.id,
            namaBahan: updatedBahan.nama,
            aksi: isTambah ? 'TAMBAH' : 'KURANG',
            jumlah: absSelisih,
            stokAkhir: updatedKuantitas,
            hargaBeli: updatedBahan.hargaBeli,
            hargaJual: updatedBahan.harga,
            totalNilai: isTambah ? Math.max(0, (updatedBahan.hargaBeli || 0) - (existingBahan.hargaBeli || 0)) : 0,
            keterangan: keterangan_ubah || (isTambah ? 'Penambahan ketersediaan' : 'Pengurangan ketersediaan'),
            actor: actor || 'System',
            customerName: customerName || actor || 'Tim Internal',
            buktiNotaUrl: isTambah ? (updatedBahan.buktiNotaUrl || null) : null
        });
    } else if (
        nama !== existingBahan.nama ||
        deskripsi !== existingBahan.deskripsi ||
        newImageUrl !== existingBahan.imageUrl ||
        newBuktiNotaUrl !== existingBahan.buktiNotaUrl ||
        updatedRasio !== existingBahan.rasioKonversi ||
        updatedStatus !== existingBahan.status ||
        updatedHarga !== existingBahan.harga ||
        updatedHargaBeli !== (existingBahan.hargaBeli || 0)
    ) {
        const deltaModal = Math.max(0, (updatedBahan.hargaBeli || 0) - (existingBahan.hargaBeli || 0));
        const isModalIncrease = deltaModal > 0;
        const defaultKeterangan = isModalIncrease
            ? 'Penambahan modal bahan baju'
            : updatedStatus !== existingBahan.status
                ? `Status ketersediaan diubah dari ${existingBahan.status} menjadi ${updatedStatus}`
                : 'Pembaruan detail bahan baju';
        await bahanBajuRepository.createHistory({
            bahanId: existingBahan.id,
            namaBahan: updatedBahan.nama,
            aksi: isModalIncrease ? 'TAMBAH' : 'UBAH',
            jumlah: 0,
            stokAkhir: updatedKuantitas,
            hargaBeli: updatedBahan.hargaBeli,
            hargaJual: updatedBahan.harga,
            totalNilai: deltaModal,
            keterangan: keterangan_ubah || defaultKeterangan,
            actor: actor || 'System',
            customerName: customerName || actor || 'Tim Internal',
            buktiNotaUrl: isModalIncrease ? (newUploadedBuktiNotaUrl || updatedBahan.buktiNotaUrl || null) : (newUploadedBuktiNotaUrl || null)
        });
    }

    return updatedBahan;
};

const deleteBahan = async (id, actor, customerName) => {
    const existingBahan = await bahanBajuRepository.findBahanById(id);
    if (!existingBahan) {
        const error = new Error('Not found');
        error.statusCode = 404;
        throw error;
    }

    await bahanBajuRepository.createHistory({
        bahanId: existingBahan.id,
        namaBahan: existingBahan.nama,
        aksi: 'HAPUS',
        jumlah: existingBahan.kuantitasKg,
        stokAkhir: 0,
        hargaBeli: existingBahan.hargaBeli,
        hargaJual: existingBahan.harga,
        totalNilai: 0,
        keterangan: `Menghapus bahan ${existingBahan.nama} (Status terakhir: ${existingBahan.status})`,
        actor: actor || 'System',
        customerName: customerName || actor || 'Tim Internal'
    });

    await bahanBajuRepository.deleteBahan(id);
    return { message: 'Deleted' };
};

module.exports = {
    getAllBahan,
    getHistory,
    getReturBahan,
    createBahan,
    updateBahan,
    deleteBahan
};
