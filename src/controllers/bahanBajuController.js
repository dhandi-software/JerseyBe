const bahanBajuService = require('../services/bahanBajuService');

const getAllBahan = async (req, res) => {
    try {
        const bahan = await bahanBajuService.getAllBahan();
        res.json({ status: 'success', data: bahan });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const getHistory = async (req, res) => {
    try {
        const history = await bahanBajuService.getHistory();
        res.json({ status: 'success', data: history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const getReturBahan = async (req, res) => {
    try {
        const retur = await bahanBajuService.getReturBahan();
        res.json({ status: 'success', data: retur });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

const createBahan = async (req, res) => {
    const { nama, deskripsi, kuantitasKg, rasioKonversi, status, harga, hargaBeli, actor } = req.body;
    const imageUrl = req.files && req.files.image ? `/uploads/${req.files.image[0].filename}` : null;
    const buktiNotaUrl = req.files && req.files.buktiNota ? `/uploads/${req.files.buktiNota[0].filename}` : null;

    try {
        const newBahan = await bahanBajuService.createBahan({
            nama,
            deskripsi,
            kuantitasKg,
            rasioKonversi,
            status,
            harga,
            hargaBeli,
            actor,
            imageUrl,
            buktiNotaUrl
        });

        res.json({ status: 'success', data: newBahan });
    } catch (error) {
        console.error('CREATE_BAHAN_ERROR:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Internal server error' });
    }
};

const updateBahan = async (req, res) => {
    const { id } = req.params;
    const {
        nama,
        deskripsi,
        kuantitasKg,
        rasioKonversi,
        status,
        harga,
        hargaBeli,
        keterangan_ubah,
        deleteImage,
        deleteBuktiNota,
        actor
    } = req.body;

    const newUploadedImageUrl = req.files && req.files.image ? `/uploads/${req.files.image[0].filename}` : undefined;
    const newUploadedBuktiNotaUrl = req.files && req.files.buktiNota ? `/uploads/${req.files.buktiNota[0].filename}` : undefined;

    try {
        const updatedBahan = await bahanBajuService.updateBahan(id, {
            nama,
            deskripsi,
            kuantitasKg,
            rasioKonversi,
            status,
            harga,
            hargaBeli,
            keterangan_ubah,
            deleteImage,
            deleteBuktiNota,
            actor,
            newUploadedImageUrl,
            newUploadedBuktiNotaUrl
        });

        res.json({ status: 'success', data: updatedBahan });
    } catch (error) {
        console.error('UPDATE_BAHAN_ERROR:', error);
        if (error.statusCode === 404) {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ status: 'error', message: error.message || 'Internal server error' });
    }
};

const deleteBahan = async (req, res) => {
    const { id } = req.params;
    const { actor } = req.query;

    try {
        const result = await bahanBajuService.deleteBahan(id, actor);
        res.json({ status: 'success', message: result.message });
    } catch (error) {
        console.error(error);
        if (error.statusCode === 404) {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

module.exports = {
    getAllBahan,
    getHistory,
    getReturBahan,
    createBahan,
    updateBahan,
    deleteBahan
};
