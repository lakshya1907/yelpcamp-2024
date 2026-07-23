const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BookingSchema = new Schema({
    campground: {
        type: Schema.Types.ObjectId,
        ref: 'Campground',
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Stored as UTC midnight Date objects. startDate is the first night
    // stayed; endDate is the checkout day (i.e. the night before endDate
    // is the last night stayed) - standard hotel/booking convention.
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    nights: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled'],
        default: 'confirmed'
    }
}, { timestamps: true });

BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ campground: 1, status: 1 });

module.exports = mongoose.model('Booking', BookingSchema);
