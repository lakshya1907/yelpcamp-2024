const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Readable } = require('stream');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// Buffer uploads in memory, then stream straight to Cloudinary. This replaces
// the now-unmaintained `multer-storage-cloudinary` package, which only
// supports Cloudinary v1 (an outdated, vulnerable major version) as a peer
// dependency.
const storage = multer.memoryStorage();

function uploadBufferToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'YelpCamp', allowed_formats: ['jpeg', 'png', 'jpg'] },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        Readable.from(buffer).pipe(uploadStream);
    });
}

module.exports = {
    cloudinary,
    storage,
    uploadBufferToCloudinary
}
