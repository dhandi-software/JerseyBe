const storageLocationService = require('../services/storageLocationService');

const handleControllerError = (res, logPrefix, error, fallbackMessage) => {
    console.error(logPrefix, error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
        status: 'error',
        message: error.message || fallbackMessage
    });
};

const getAllLocations = async (req, res) => {
    try {
        const locations = await storageLocationService.getAllLocations();
        res.json({
            status: 'success',
            data: locations
        });
    } catch (error) {
        handleControllerError(res, 'GET_ALL_LOCATIONS_ERROR:', error, 'Gagal mengambil daftar lokasi penyimpanan');
    }
};

const getLocationById = async (req, res) => {
    try {
        const { id } = req.params;
        const location = await storageLocationService.getLocationById(id);
        res.json({
            status: 'success',
            data: location
        });
    } catch (error) {
        handleControllerError(res, 'GET_LOCATION_BY_ID_ERROR:', error, 'Gagal mengambil detail lokasi penyimpanan');
    }
};

const createLocation = async (req, res) => {
    try {
        const { name, code, address, notes } = req.body;
        const newLocation = await storageLocationService.createLocation({ name, code, address, notes });
        res.status(201).json({
            status: 'success',
            message: 'Lokasi penyimpanan berhasil dibuat',
            data: newLocation
        });
    } catch (error) {
        handleControllerError(res, 'CREATE_LOCATION_ERROR:', error, 'Gagal membuat lokasi penyimpanan');
    }
};

const updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, address, notes } = req.body;
        const updated = await storageLocationService.updateLocation(id, { name, code, address, notes });
        res.json({
            status: 'success',
            message: 'Lokasi penyimpanan berhasil diperbarui',
            data: updated
        });
    } catch (error) {
        handleControllerError(res, 'UPDATE_LOCATION_ERROR:', error, 'Gagal memperbarui lokasi penyimpanan');
    }
};

const deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await storageLocationService.deleteLocation(id);
        res.json({
            status: 'success',
            message: result.message
        });
    } catch (error) {
        handleControllerError(res, 'DELETE_LOCATION_ERROR:', error, 'Gagal menghapus lokasi penyimpanan');
    }
};

module.exports = {
    getAllLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation
};
