const express = require('express');
const router = express.Router();
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const catchAsync = require('../utils/catchAsync');
const { verifyCsrf } = require('../middleware');
const users = require('../controllers/users');

// Basic brute-force protection on auth endpoints.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many attempts from this IP, please try again after 15 minutes.'
});

router.route('/register')
    .get(users.renderRegister)
    .post(authLimiter, verifyCsrf, catchAsync(users.register));

router.route('/login')
    .get(users.renderLogin)
    .post(authLimiter, verifyCsrf, passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), users.login)

router.get('/logout', users.logout)

module.exports = router;
