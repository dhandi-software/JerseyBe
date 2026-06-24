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
router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'buktiNota', maxCount: 1 }]), createBahan);
router.put('/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'buktiNota', maxCount: 1 }]), updateBahan);
router.delete('/:id', deleteBahan);

module.exports = router;
