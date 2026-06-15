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
    const { nama, deskripsi, stok, harga, actor } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    const parsedStok = parseInt(stok);
    const finalStok = isNaN(parsedStok) ? 0 : parsedStok;
    
    const parsedHarga = parseFloat(harga);
    const finalHarga = isNaN(parsedHarga) ? 0 : parsedHarga;

    try {
        console.log("Creating Bahan:", { nama, finalStok, finalHarga });
        const newBahan = await prisma.bahanBaju.create({
            data: {
                nama,
                deskripsi,
                stok: finalStok,
                harga: finalHarga,
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
    const { nama, deskripsi, stok, harga, keterangan_ubah, deleteImage, actor } = req.body;

    try {
        const existingBahan = await prisma.bahanBaju.findUnique({ where: { id: parseInt(id) } });
        if (!existingBahan) return res.status(404).json({ message: 'Not found' });

        const parsedStok = parseInt(stok);
        const updatedStok = isNaN(parsedStok) ? existingBahan.stok : parsedStok;
        
        const parsedHarga = parseFloat(harga);
        const updatedHarga = isNaN(parsedHarga) ? existingBahan.harga : parsedHarga;

        const selisih = updatedStok - existingBahan.stok;

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
                stok: updatedStok, 
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
                    stokAkhir: updatedStok,
                    keterangan: keterangan_ubah || (selisih > 0 ? "Penambahan stok" : "Pengurangan stok"),
                    actor: actor || "System"
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
                    keterangan: "Pembaruan detail bahan/gambar",
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
                jumlah: existingBahan.stok,
                stokAkhir: 0,
                keterangan: `Menghapus bahan ${existingBahan.nama} (Stok terakhir: ${existingBahan.stok})`,
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
