const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
    getAllBahan,
    getHistory,
    createBahan,
    updateBahan,
    deleteBahan
} = require('../controllers/bahanBajuController');

router.get('/', getAllBahan);
router.get('/history', getHistory);
router.post('/', upload.single('image'), createBahan);
router.put('/:id', upload.single('image'), updateBahan);
router.delete('/:id', deleteBahan);

module.exports = router;
