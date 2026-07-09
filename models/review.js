const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const reviewSchema = new Schema({
    body: String,
    rating: Number,
    // Set by AI sentiment analysis on creation (utils/aiInsights.js).
    // Null if the AI feature is disabled or the call failed.
    sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative', null],
        default: null
    },
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
});

module.exports = mongoose.model("Review", reviewSchema);

