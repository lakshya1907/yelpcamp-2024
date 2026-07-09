const express = require('express');
const router = express.Router();
const campgrounds = require('../controllers/campgrounds');
const catchAsync = require('../utils/catchAsync');
const { isLoggedIn, isAuthor, validateCampground, verifyCsrf } = require('../middleware');
const multer = require('multer');
const { storage } = require('../cloudinary');
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 6 }, // 5MB per file, max 6 files
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Only JPEG and PNG images are allowed'));
        }
        cb(null, true);
    }
});

router.route('/')
    .get(catchAsync(campgrounds.index))
    .post(isLoggedIn, upload.array('image'), verifyCsrf, validateCampground, catchAsync(campgrounds.createCampground))


router.get('/new', isLoggedIn, campgrounds.renderNewForm)

router.get('/search', catchAsync(campgrounds.search))

router.route('/:id')
    .get(catchAsync(campgrounds.showCampground))
    .put(isLoggedIn, isAuthor, upload.array('image'), verifyCsrf, validateCampground, catchAsync(campgrounds.updateCampground))
    .delete(isLoggedIn, isAuthor, verifyCsrf, catchAsync(campgrounds.deleteCampground));

router.get('/:id/edit', isLoggedIn, isAuthor, catchAsync(campgrounds.renderEditForm))



module.exports = router;
