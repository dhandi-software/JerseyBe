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
    const { nama, deskripsi, stok } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    try {
        const newBahan = await prisma.bahanBaju.create({
            data: {
                nama,
                deskripsi,
                stok: parseInt(stok) || 0,
                imageUrl
            }
        });

        await prisma.bahanBajuHistory.create({
            data: {
                bahanId: newBahan.id,
                namaBahan: newBahan.nama,
                aksi: "BUAT",
                jumlah: newBahan.stok,
                stokAkhir: newBahan.stok,
                keterangan: "Bahan baju baru ditambahkan"
            }
        });

        res.json({ status: 'success', data: newBahan });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const updateBahan = async (req, res) => {
    const { id } = req.params;
    const { nama, deskripsi, stok, keterangan_ubah, deleteImage } = req.body;

    try {
        const existingBahan = await prisma.bahanBaju.findUnique({ where: { id: parseInt(id) } });
        if (!existingBahan) return res.status(404).json({ message: 'Not found' });

        const updatedStok = parseInt(stok);
        const selisih = updatedStok - existingBahan.stok;

        let newImageUrl = existingBahan.imageUrl;
        if (req.file) {
            newImageUrl = `/uploads/${req.file.filename}`;
        } else if (deleteImage === "true") {
            newImageUrl = null;
        }

        const updatedBahan = await prisma.bahanBaju.update({
            where: { id: parseInt(id) },
            data: { nama, deskripsi, stok: updatedStok, imageUrl: newImageUrl }
        });

        if (selisih !== 0) {
            await prisma.bahanBajuHistory.create({
                data: {
                    bahanId: existingBahan.id,
                    namaBahan: updatedBahan.nama,
                    aksi: selisih > 0 ? "TAMBAH" : "KURANG",
                    jumlah: Math.abs(selisih),
                    stokAkhir: updatedStok,
                    keterangan: keterangan_ubah || (selisih > 0 ? "Penambahan stok" : "Pengurangan stok")
                }
            });
        } else if (nama !== existingBahan.nama || deskripsi !== existingBahan.deskripsi || newImageUrl !== existingBahan.imageUrl) {
             await prisma.bahanBajuHistory.create({
                data: {
                    bahanId: existingBahan.id,
                    namaBahan: updatedBahan.nama,
                    aksi: "UBAH",
                    jumlah: 0,
                    stokAkhir: updatedStok,
                    keterangan: "Pembaruan detail bahan/gambar"
                }
            });
        }

        res.json({ status: 'success', data: updatedBahan });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const deleteBahan = async (req, res) => {
    const { id } = req.params;
    try {
        const existingBahan = await prisma.bahanBaju.findUnique({ where: { id: parseInt(id) } });
        if (!existingBahan) return res.status(404).json({ message: 'Not found' });

        // Record deletion in history BEFORE deleting the item
        await prisma.bahanBajuHistory.create({
            data: {
                bahanId: existingBahan.id,
                namaBahan: existingBahan.nama,
                aksi: "HAPUS",
                jumlah: existingBahan.stok,
                stokAkhir: 0,
                keterangan: `Menghapus bahan ${existingBahan.nama} (Stok terakhir: ${existingBahan.stok})`
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
