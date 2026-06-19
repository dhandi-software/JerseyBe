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
    const { nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, actor } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    const parsedKuantitas = parseFloat(kuantitasKg);
    const finalKuantitas = isNaN(parsedKuantitas) ? 0 : parsedKuantitas;
    
    const parsedRasio = parseFloat(rasioKonversi);
    const finalRasio = isNaN(parsedRasio) ? 1.0 : parsedRasio;

    const finalStatus = status || (finalKuantitas <= 0 ? "Habis" : "Tersedia");
    
    const parsedHarga = parseFloat(harga);
    const finalHarga = isNaN(parsedHarga) ? 0 : parsedHarga;

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
                imageUrl
            }
        });

        await prisma.bahanBajuHistory.create({
            data: {
                bahanId: newBahan.id,
                namaBahan: newBahan.nama,
                aksi: "BUAT",
                jumlah: newBahan.kuantitasKg,
                stokAkhir: newBahan.kuantitasKg,
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
    const { nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, keterangan_ubah, deleteImage, actor } = req.body;

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

        const selisih = updatedKuantitas - existingBahan.kuantitasKg;

        let newImageUrl = existingBahan.imageUrl;
        if (req.file) {
            newImageUrl = `/uploads/${req.file.filename}`;
        } else if (deleteImage === "true") {
            newImageUrl = null;
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
                imageUrl: newImageUrl
            }
        });

        if (selisih !== 0) {
            await prisma.bahanBajuHistory.create({
                data: {
                    bahanId: existingBahan.id,
                    namaBahan: updatedBahan.nama,
                    aksi: selisih > 0 ? "TAMBAH" : "KURANG",
                    jumlah: Math.abs(selisih),
                    stokAkhir: updatedKuantitas,
                    keterangan: keterangan_ubah || (selisih > 0 ? "Penambahan ketersediaan" : "Pengurangan ketersediaan"),
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
