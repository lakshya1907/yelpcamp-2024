const Campground = require('../models/campground');
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });
const { cloudinary, uploadBufferToCloudinary } = require("../cloudinary");
const { summarizeReviews } = require('../utils/aiInsights');

const CAMPGROUNDS_PER_PAGE = 12;

module.exports.index = async (req, res) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * CAMPGROUNDS_PER_PAGE;

    const [campgrounds, total] = await Promise.all([
        Campground.find({}).skip(skip).limit(CAMPGROUNDS_PER_PAGE),
        Campground.countDocuments()
    ]);
    const totalPages = Math.max(Math.ceil(total / CAMPGROUNDS_PER_PAGE), 1);

    res.render('campgrounds/index', { campgrounds, page, totalPages })
}

module.exports.renderNewForm = (req, res) => {
    res.render('campgrounds/new');
}

module.exports.createCampground = async (req, res, next) => {
    const geoData = await geocoder.forwardGeocode({
        query: req.body.campground.location,
        limit: 1
    }).send()
    const campground = new Campground(req.body.campground);
    campground.geometry = geoData.body.features[0].geometry;
    const uploads = await Promise.all(req.files.map(f => uploadBufferToCloudinary(f.buffer)));
    campground.images = uploads.map(u => ({ url: u.secure_url, filename: u.public_id }));
    campground.author = req.user._id;
    await campground.save();
    req.flash('success', 'Successfully made a new campground!');
    res.redirect(`/campgrounds/${campground._id}`)
}

module.exports.showCampground = async (req, res,) => {
    const campground = await Campground.findById(req.params.id).populate({
        path: 'reviews',
        populate: {
            path: 'author'
        }
    }).populate('author');
    if (!campground) {
        req.flash('error', 'Cannot find that campground!');
        return res.redirect('/campgrounds');
    }
    // Only re-summarize when the review count has changed, so we don't
    // burn an AI call on every single page view.
    if (campground.reviews.length > 0 && campground.reviews.length !== campground.reviewSummaryReviewCount) {
        const summary = await summarizeReviews(campground.reviews);
        if (summary) {
            campground.reviewSummary = summary;
            campground.reviewSummaryReviewCount = campground.reviews.length;
            await campground.save();
        }
    }
    res.render('campgrounds/show', { campground });
}

module.exports.renderEditForm = async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id)
    if (!campground) {
        req.flash('error', 'Cannot find that campground!');
        return res.redirect('/campgrounds');
    }
    res.render('campgrounds/edit', { campground });
}

module.exports.updateCampground = async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findByIdAndUpdate(id, { ...req.body.campground });
    const uploads = await Promise.all(req.files.map(f => uploadBufferToCloudinary(f.buffer)));
    const imgs = uploads.map(u => ({ url: u.secure_url, filename: u.public_id }));
    campground.images.push(...imgs);
    await campground.save();
    if (req.body.deleteImages) {
        for (let filename of req.body.deleteImages) {
            await cloudinary.uploader.destroy(filename);
        }
        await campground.updateOne({ $pull: { images: { filename: { $in: req.body.deleteImages } } } })
    }
    req.flash('success', 'Successfully updated campground!');
    res.redirect(`/campgrounds/${campground._id}`)
}

module.exports.deleteCampground = async (req, res) => {
    const { id } = req.params;
    await Campground.findByIdAndDelete(id);
    req.flash('success', 'Successfully deleted campground')
    res.redirect('/campgrounds');
}
