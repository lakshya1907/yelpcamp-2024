const mongoose = require('mongoose');
const Campground = require('../models/campground');
const Booking = require('../models/booking');
const BookingSlot = require('../models/bookingSlot');

// Builds one UTC-midnight Date per night of the stay. endDate itself
// (checkout day) is NOT included - only the nights actually slept there.
const nightsBetween = (startDate, endDate) => {
    const nights = [];
    const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
    while (cur < end) {
        nights.push(new Date(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return nights;
};

module.exports.renderBookingForm = async (req, res) => {
    const campground = await Campground.findById(req.params.id);
    if (!campground) {
        req.flash('error', 'Cannot find that campground!');
        return res.redirect('/campgrounds');
    }
    res.render('bookings/new', { campground });
};

module.exports.createBooking = async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id);
    if (!campground) {
        req.flash('error', 'Cannot find that campground!');
        return res.redirect('/campgrounds');
    }

    if (campground.author && campground.author.equals(req.user._id)) {
        req.flash('error', "You can't book your own campground.");
        return res.redirect(`/campgrounds/${id}`);
    }

    const startDate = new Date(req.body.booking.startDate);
    const endDate = new Date(req.body.booking.endDate);

    const nights = nightsBetween(startDate, endDate);
    if (nights.length === 0) {
        req.flash('error', 'Checkout date must be after check-in date.');
        return res.redirect(`/campgrounds/${id}/book`);
    }

    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    if (nights[0] < today) {
        req.flash('error', 'Check-in date cannot be in the past.');
        return res.redirect(`/campgrounds/${id}/book`);
    }

    const totalPrice = nights.length * campground.price;

    const session = await mongoose.startSession();
    let booking;
    try {
        await session.withTransaction(async () => {
            const [createdBooking] = await Booking.create([{
                campground: campground._id,
                user: req.user._id,
                startDate: nights[0],
                endDate,
                nights: nights.length,
                totalPrice
            }], { session });
            booking = createdBooking;

            // This insertMany is where double-booking is actually prevented:
            // the unique (campground, date) index on BookingSlot will throw
            // a duplicate-key error (E11000) if any of these nights are
            // already booked, which aborts the whole transaction - both the
            // slots AND the Booking document above are rolled back together.
            await BookingSlot.insertMany(
                nights.map(date => ({ campground: campground._id, date, booking: createdBooking._id })),
                { session, ordered: true }
            );
        });
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'Sorry, one or more of those nights just got booked by someone else. Please pick different dates.');
            return res.redirect(`/campgrounds/${id}/book`);
        }
        throw err;
    } finally {
        await session.endSession();
    }

    req.flash('success', 'Booking confirmed!');
    res.redirect(`/bookings/${booking._id}`);
};

module.exports.showBooking = async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId).populate('campground');
    res.render('bookings/show', { booking });
};

module.exports.myBookings = async (req, res) => {
    const bookings = await Booking.find({ user: req.user._id })
        .populate('campground')
        .sort({ createdAt: -1 });
    res.render('bookings/index', { bookings });
};

module.exports.cancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (booking.status === 'cancelled') {
        req.flash('error', 'That booking is already cancelled.');
        return res.redirect('/bookings');
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            booking.status = 'cancelled';
            await booking.save({ session });
            // Freeing the slots is what makes the dates bookable again.
            await BookingSlot.deleteMany({ booking: booking._id }, { session });
        });
    } finally {
        await session.endSession();
    }

    req.flash('success', 'Booking cancelled.');
    res.redirect('/bookings');
};

// Returns already-booked nights for a campground, so the booking form can
// disable those dates in the date picker.
module.exports.bookedDates = async (req, res) => {
    const slots = await BookingSlot.find({ campground: req.params.id }, 'date -_id');
    res.json(slots.map(s => s.date));
};
