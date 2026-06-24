const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getAllBahan = async (req, res) => {
    try {
        const bahan = await prisma.bahanBaju.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json({ status: 'success', data: bahan });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const getHistory = async (req, res) => {
    try {
        const history = await prisma.bahanBajuHistory.findMany({
            include: { bahan: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ status: 'success', data: history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const createBahan = async (req, res) => {
    const { nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, hargaBeli, actor } = req.body;
    const imageUrl = req.files && req.files.image ? `/uploads/${req.files.image[0].filename}` : null;
    const buktiNotaUrl = req.files && req.files.buktiNota ? `/uploads/${req.files.buktiNota[0].filename}` : null;
    
    const parsedKuantitas = parseFloat(kuantitasKg);
    const finalKuantitas = isNaN(parsedKuantitas) ? 0 : parsedKuantitas;
    
    const parsedRasio = parseFloat(rasioKonversi);
    const finalRasio = isNaN(parsedRasio) ? 1.0 : parsedRasio;

    const finalStatus = status || (finalKuantitas <= 0 ? "Habis" : "Tersedia");
    
    const parsedHarga = parseFloat(harga);
    const finalHarga = isNaN(parsedHarga) ? 0 : parsedHarga;

    const parsedHargaBeli = parseFloat(hargaBeli);
    const finalHargaBeli = isNaN(parsedHargaBeli) ? 0 : parsedHargaBeli;

    try {
        console.log("Creating Bahan:", { nama, finalKuantitas, finalRasio, finalStatus, finalHarga });
        const newBahan = await prisma.bahanBaju.create({
            data: {
                nama,
                deskripsi,
                kuantitasKg: finalKuantitas,
                rasioKonversi: finalRasio,
                status: finalStatus,
                harga: finalHarga,
                hargaBeli: finalHargaBeli,
                imageUrl,
                buktiNotaUrl
            }
        });

        await prisma.bahanBajuHistory.create({
            data: {
                bahanId: newBahan.id,
                namaBahan: newBahan.nama,
                aksi: "BUAT",
                jumlah: newBahan.kuantitasKg,
                stokAkhir: newBahan.kuantitasKg,
                hargaBeli: newBahan.hargaBeli,
                hargaJual: newBahan.harga,
                totalNilai: newBahan.kuantitasKg * (newBahan.hargaBeli || 0),
                keterangan: "Bahan baju baru ditambahkan",
                actor: actor || "System"
            }
        });

        res.json({ status: 'success', data: newBahan });
    } catch (error) {
        console.error("CREATE_BAHAN_ERROR:", error);
        res.status(500).json({ status: 'error', message: error.message || 'Internal server error' });
    }
};

const updateBahan = async (req, res) => {
    const { id } = req.params;
    const { nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, hargaBeli, keterangan_ubah, deleteImage, deleteBuktiNota, actor } = req.body;

    try {
        const existingBahan = await prisma.bahanBaju.findUnique({ where: { id: parseInt(id) } });
        if (!existingBahan) return res.status(404).json({ message: 'Not found' });

        const parsedKuantitas = parseFloat(kuantitasKg);
        const updatedKuantitas = isNaN(parsedKuantitas) ? existingBahan.kuantitasKg : parsedKuantitas;
        
        const parsedRasio = parseFloat(rasioKonversi);
        const updatedRasio = isNaN(parsedRasio) ? existingBahan.rasioKonversi : parsedRasio;

        const updatedStatus = status || (updatedKuantitas <= 0 ? "Habis" : "Tersedia");
        
        const parsedHarga = parseFloat(harga);
        const updatedHarga = isNaN(parsedHarga) ? existingBahan.harga : parsedHarga;

        const parsedHargaBeli = parseFloat(hargaBeli);
        const updatedHargaBeli = isNaN(parsedHargaBeli) ? (existingBahan.hargaBeli || 0) : parsedHargaBeli;

        const selisih = updatedKuantitas - existingBahan.kuantitasKg;

        let newImageUrl = existingBahan.imageUrl;
        if (req.files && req.files.image) {
            newImageUrl = `/uploads/${req.files.image[0].filename}`;
        } else if (deleteImage === "true") {
            newImageUrl = null;
        }

        let newBuktiNotaUrl = existingBahan.buktiNotaUrl;
        if (req.files && req.files.buktiNota) {
            newBuktiNotaUrl = `/uploads/${req.files.buktiNota[0].filename}`;
        } else if (deleteBuktiNota === "true") {
            newBuktiNotaUrl = null;
        }

        const updatedBahan = await prisma.bahanBaju.update({
            where: { id: parseInt(id) },
            data: { 
                nama, 
                deskripsi, 
                kuantitasKg: updatedKuantitas, 
                rasioKonversi: updatedRasio,
                status: updatedStatus,
                harga: updatedHarga,
                hargaBeli: updatedHargaBeli,
                imageUrl: newImageUrl,
                buktiNotaUrl: newBuktiNotaUrl
            }
        });

        if (selisih !== 0) {
            const isTambah = selisih > 0;
            const absSelisih = Math.abs(selisih);
            await prisma.bahanBajuHistory.create({
                data: {
                    bahanId: existingBahan.id,
                    namaBahan: updatedBahan.nama,
                    aksi: isTambah ? "TAMBAH" : "KURANG",
                    jumlah: absSelisih,
                    stokAkhir: updatedKuantitas,
                    hargaBeli: updatedBahan.hargaBeli,
                    hargaJual: updatedBahan.harga,
                    totalNilai: isTambah ? (absSelisih * (updatedBahan.hargaBeli || 0)) : 0,
                    keterangan: keterangan_ubah || (isTambah ? "Penambahan ketersediaan" : "Pengurangan ketersediaan"),
                    actor: actor || "System"
                }
            });
        } else if (nama !== existingBahan.nama || deskripsi !== existingBahan.deskripsi || newImageUrl !== existingBahan.imageUrl || updatedRasio !== existingBahan.rasioKonversi || updatedStatus !== existingBahan.status) {
             await prisma.bahanBajuHistory.create({
                data: {
                    bahanId: existingBahan.id,
                    namaBahan: updatedBahan.nama,
                    aksi: "UBAH",
                    jumlah: 0,
                    stokAkhir: updatedKuantitas,
                    hargaBeli: updatedBahan.hargaBeli,
                    hargaJual: updatedBahan.harga,
                    totalNilai: 0,
                    keterangan: "Pembaruan detail ketersediaan/rasio/status/gambar",
                    actor: actor || "System"
                }
            });
        }

        res.json({ status: 'success', data: updatedBahan });
    } catch (error) {
        console.error("UPDATE_BAHAN_ERROR:", error);
        res.status(500).json({ status: 'error', message: error.message || 'Internal server error' });
    }
};

const deleteBahan = async (req, res) => {
    const { id } = req.params;
    const { actor } = req.query;
    try {
        const existingBahan = await prisma.bahanBaju.findUnique({ where: { id: parseInt(id) } });
        if (!existingBahan) return res.status(404).json({ message: 'Not found' });

        // Record deletion in history BEFORE deleting the item
        await prisma.bahanBajuHistory.create({
            data: {
                bahanId: existingBahan.id,
                namaBahan: existingBahan.nama,
                aksi: "HAPUS",
                jumlah: existingBahan.kuantitasKg,
                stokAkhir: 0,
                hargaBeli: existingBahan.hargaBeli,
                hargaJual: existingBahan.harga,
                totalNilai: 0,
                keterangan: `Menghapus bahan ${existingBahan.nama} (Ketersediaan terakhir: ${existingBahan.kuantitasKg} kg)`,
                actor: actor || "System"
            }
        });

        await prisma.bahanBaju.delete({
            where: { id: parseInt(id) }
        });
        res.json({ status: 'success', message: 'Deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

module.exports = {
    getAllBahan,
    getHistory,
    createBahan,
    updateBahan,
    deleteBahan
};
