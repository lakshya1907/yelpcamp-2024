const Campground = require('../models/campground');
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });
const { cloudinary, uploadBufferToCloudinary } = require("../cloudinary");
const { summarizeReviews, analyzeReviewAspects, parseSearchQuery } = require('../utils/aiInsights');
const { getEmbedding, buildEmbeddingText } = require('../utils/embeddings');

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
    const embedding = await getEmbedding(buildEmbeddingText(campground), 'document');
    if (embedding) campground.embedding = embedding;
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
    // Only re-run AI analysis when the review count has changed, so we
    // don't burn API calls on every single page view.
    if (campground.reviews.length > 0 && campground.reviews.length !== campground.reviewSummaryReviewCount) {
        const [summary, aspects] = await Promise.all([
            summarizeReviews(campground.reviews),
            analyzeReviewAspects(campground.reviews)
        ]);
        if (summary) campground.reviewSummary = summary;
        if (aspects) campground.aspectSummary = aspects;
        campground.reviewSummaryReviewCount = campground.reviews.length;
        await campground.save();
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
    const campground = await Campground.findByIdAndUpdate(id, { ...req.body.campground }, { new: true });
    const uploads = await Promise.all(req.files.map(f => uploadBufferToCloudinary(f.buffer)));
    const imgs = uploads.map(u => ({ url: u.secure_url, filename: u.public_id }));
    campground.images.push(...imgs);
    const embedding = await getEmbedding(buildEmbeddingText(campground), 'document');
    if (embedding) campground.embedding = embedding;
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

module.exports.search = async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) {
        return res.render('campgrounds/search', { campgrounds: null, query: '' });
    }

    if (!process.env.VOYAGE_API_KEY) {
        req.flash('error', 'Semantic search is not configured (missing VOYAGE_API_KEY).');
        return res.redirect('/campgrounds');
    }

    // Let Claude split "quiet mountain spot under 5000" into a clean
    // semantic phrase + a structured price ceiling, then embed the
    // semantic phrase and run it through Atlas Vector Search.
    const { semanticQuery, maxPrice } = await parseSearchQuery(q);
    const queryVector = await getEmbedding(semanticQuery, 'query');

    if (!queryVector) {
        req.flash('error', 'Search is temporarily unavailable. Please try again shortly.');
        return res.redirect('/campgrounds');
    }

    const pipeline = [
        {
            $vectorSearch: {
                index: 'campground_vector_index',
                path: 'embedding',
                queryVector,
                numCandidates: 150,
                limit: 12,
                ...(maxPrice ? { filter: { price: { $lte: maxPrice } } } : {})
            }
        },
        {
            $project: {
                title: 1,
                price: 1,
                location: 1,
                description: 1,
                images: 1,
                score: { $meta: 'vectorSearchScore' }
            }
        }
    ];

    let campgrounds;
    try {
        campgrounds = await Campground.aggregate(pipeline);
    } catch (err) {
        // Most likely cause: the Atlas vector index hasn't been created yet.
        console.error('Vector search failed:', err.message);
        req.flash('error', 'Search index not ready yet - see scripts/createVectorIndex.js.');
        return res.redirect('/campgrounds');
    }

    res.render('campgrounds/search', { campgrounds, query: q });
}

module.exports.deleteCampground = async (req, res) => {
    const { id } = req.params;
    await Campground.findByIdAndDelete(id);
    req.flash('success', 'Successfully deleted campground')
    res.redirect('/campgrounds');
}
