if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const mongoose = require('mongoose');
const cities = require('./cities');
const { places, descriptors } = require('./seedHelpers');
const Campground = require('../models/campground');
const User = require('../models/user');

// Matches the connection logic in app.js so this script works locally
// and against Atlas (or wherever DB_URL points) without edits.
const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017/yelp-camp';

// How many campgrounds to generate. Override with: SEED_COUNT=100 node seeds/index.js
const SEED_COUNT = parseInt(process.env.SEED_COUNT, 10) || 50;

// Dedicated seed account that owns all generated campgrounds, so
// "edit/delete" ownership checks throughout the app work correctly
// instead of pointing at a hardcoded ObjectId that doesn't exist in
// your database.
const SEED_USERNAME = 'yelpcamp-demo';
const SEED_EMAIL = 'demo@yelpcamp.local';
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD || 'yelpcamp-demo-password';

mongoose.connect(dbUrl);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Database connected');
});

const sample = array => array[Math.floor(Math.random() * array.length)];
const sampleN = (array, n) => [...array].sort(() => Math.random() - 0.5).slice(0, n);

// Curated, real camping/outdoors photos from Unsplash (free to use under the
// Unsplash License). These are direct, stable CDN links to specific photos -
// no API key needed, and no risk of getting a random unrelated image the
// way a generic "random photo" service would give you.
const CAMP_IMAGES = [
    'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4',
    'https://images.unsplash.com/photo-1504851149312-7a075b6a98be',
    'https://images.unsplash.com/photo-1470770903676-69b98201ea1c',
    'https://images.unsplash.com/photo-1537565266759-34bb4dcda6b5',
    'https://images.unsplash.com/photo-1487730116645-74489c95b41b',
    'https://images.unsplash.com/photo-1516684732162-798a0062be99',
    'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d',
    'https://images.unsplash.com/photo-1455496231601-e6195da1f841',
    'https://images.unsplash.com/photo-1533587851505-d119e13fa0d7',
    'https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb',
    'https://images.unsplash.com/photo-1508873696983-2dfd5898f08b',
    'https://images.unsplash.com/photo-1571687949921-1306bfb24b72',
    'https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8',
    'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7',
    'https://images.unsplash.com/photo-1541520277-e485571b83f9',
    'https://images.unsplash.com/photo-1517824806704-9040b037703b',
    'https://images.unsplash.com/photo-1500581276021-a4bbcd0050c5',
    'https://images.unsplash.com/photo-1517322048670-4fba75cbbb62',
    'https://images.unsplash.com/photo-1445308394109-4ec2920981b1',
    'https://images.unsplash.com/photo-1607427293702-036aaf2c8de1'
];

const randomCampImage = url => ({
    url: `${url}?auto=format&fit=crop&w=1200&q=80`,
    // Not a real Cloudinary asset - deleteCampground's Cloudinary cleanup
    // call will just no-op/fail silently on this filename, which is fine.
    filename: url.split('/').pop()
});

// Building blocks for procedurally varied descriptions, so seeded
// campgrounds don't all read as generic placeholder text.
const settingPhrases = [
    'nestled at the edge of a pine forest',
    'tucked along a quiet riverbank',
    'perched on a ridge with sweeping valley views',
    'set beside a calm alpine lake',
    'surrounded by rolling meadows',
    'hidden in a shaded canyon',
    'right at the trailhead of a popular hiking route',
    'a short walk from a sandy lakeshore',
    'on the edge of a wide open desert plain',
    'wrapped in old-growth redwoods'
];
const amenityPhrases = [
    'Fire rings and picnic tables are available at every site',
    'Each site has room for a large tent or small RV',
    'Potable water and vault toilets are on-site',
    'Sites are spaced well apart for privacy',
    'A small camp store nearby sells firewood and basic supplies',
    'Well-maintained trails lead straight out from the campground',
    'Sites can be reserved for both weekend and extended stays',
    'Pets are welcome on a leash throughout the grounds'
];
const closingPhrases = [
    'a favorite for families and first-time campers alike.',
    'popular with hikers looking for an early trailhead start.',
    'a peaceful spot for anyone looking to unplug for a few days.',
    'great for stargazing once the sun goes down.',
    'ideal for a quiet weekend away from cell service.',
    'well loved by regulars who return year after year.'
];

const buildDescription = (title, location) => {
    return `${title}, located near ${location}, is ${sample(settingPhrases)}. `
        + `${sample(amenityPhrases)}. `
        + `It's ${sample(closingPhrases)}`;
};

const getOrCreateSeedUser = async () => {
    let user = await User.findOne({ username: SEED_USERNAME });
    if (!user) {
        user = await User.register(new User({ username: SEED_USERNAME, email: SEED_EMAIL }), SEED_PASSWORD);
        console.log(`Created seed user "${SEED_USERNAME}" (password: ${SEED_PASSWORD}) to own generated campgrounds.`);
    }
    return user;
};

const seedDB = async () => {
    const seedUser = await getOrCreateSeedUser();

    await Campground.deleteMany({});

    // Note: seeded campgrounds intentionally skip embedding generation.
    // Descriptions are procedurally varied but still generic/templated,
    // so a vector embedding wouldn't meaningfully differentiate them for
    // semantic search. Real campgrounds created through the UI still get
    // embeddings normally (see controllers/campgrounds.js createCampground).
    let created = 0;
    for (let i = 0; i < SEED_COUNT; i++) {
        const random1000 = Math.floor(Math.random() * 1000);
        const price = Math.floor(Math.random() * 20) + 10;
        const location = `${cities[random1000].city}, ${cities[random1000].state}`;
        const title = `${sample(descriptors)} ${sample(places)}`;

        const campground = new Campground({
            author: seedUser._id,
            location,
            title,
            description: buildDescription(title, location),
            price,
            geometry: {
                type: 'Point',
                coordinates: [
                    cities[random1000].longitude,
                    cities[random1000].latitude
                ]
            },
            images: sampleN(CAMP_IMAGES, 2).map(randomCampImage)
        });

        await campground.save();
        created++;
        if (created % 10 === 0) console.log(`${created}/${SEED_COUNT} campgrounds created...`);
    }

    console.log(`Seeded ${created} campgrounds.`);
};

seedDB()
    .catch(err => {
        console.error('Seeding failed:', err);
        process.exitCode = 1;
    })
    .finally(() => {
        mongoose.connection.close();
    });