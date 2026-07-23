const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// One document per campground per booked night. This is the mechanism that
// actually prevents double-booking under concurrency.
//
// Why not just check "does an overlapping Booking already exist?" before
// inserting a new one? Because two concurrent requests can both run that
// check, both see no overlap (MongoDB transactions use snapshot isolation,
// so each transaction reads a consistent snapshot that doesn't reflect the
// other's uncommitted write), and both then insert - resulting in two
// confirmed bookings for the same dates. A transaction alone only prevents
// conflicts on the *same document*; two different Booking documents for
// overlapping-but-distinct date ranges are not the same document, so the
// conflict goes undetected.
//
// Decomposing a reservation into one BookingSlot per night, with a unique
// compound index on (campground, date), fixes this: the second concurrent
// request's insert will always hit a duplicate-key error at the storage
// layer the instant the first one's write lands - regardless of snapshot
// timing - because uniqueness is enforced by the index itself, not by
// application logic that can race.
const BookingSlotSchema = new Schema({
    campground: {
        type: Schema.Types.ObjectId,
        ref: 'Campground',
        required: true
    },
    // Normalized to UTC midnight so "one document per night" is unambiguous.
    date: {
        type: Date,
        required: true
    },
    booking: {
        type: Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    }
});

BookingSlotSchema.index({ campground: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('BookingSlot', BookingSlotSchema);
