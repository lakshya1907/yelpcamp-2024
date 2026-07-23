const express = require('express');
const router = express.Router();
const catchAsync = require('../utils/catchAsync');
const bookings = require('../controllers/bookings');
const { isLoggedIn, validateBooking, isBookingOwner, verifyCsrf } = require('../middleware');

router.get('/campgrounds/:id/book', isLoggedIn, catchAsync(bookings.renderBookingForm));
router.post('/campgrounds/:id/book', isLoggedIn, verifyCsrf, validateBooking, catchAsync(bookings.createBooking));
router.get('/campgrounds/:id/booked-dates', catchAsync(bookings.bookedDates));

router.get('/bookings', isLoggedIn, catchAsync(bookings.myBookings));
router.get('/bookings/:bookingId', isLoggedIn, isBookingOwner, catchAsync(bookings.showBooking));
router.delete('/bookings/:bookingId', isLoggedIn, isBookingOwner, verifyCsrf, catchAsync(bookings.cancelBooking));

module.exports = router;
