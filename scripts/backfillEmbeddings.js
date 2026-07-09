// One-time backfill: generates embeddings for any campgrounds that predate
// the semantic search feature (e.g. seeded data, or campgrounds created
// before VOYAGE_API_KEY was configured).
//
// Run:
//   node scripts/backfillEmbeddings.js
require('dotenv').config();
const mongoose = require('mongoose');
const Campground = require('../models/campground');
const { getEmbedding, buildEmbeddingText } = require('../utils/embeddings');

async function main() {
    if (!process.env.VOYAGE_API_KEY) {
        console.error('Missing VOYAGE_API_KEY in .env - nothing to backfill.');
        process.exit(1);
    }

    await mongoose.connect(process.env.DB_URL);
    const campgrounds = await Campground.find({});
    console.log(`Found ${campgrounds.length} campground(s).`);

    let embedded = 0;
    let skipped = 0;

    for (const campground of campgrounds) {
        const embedding = await getEmbedding(buildEmbeddingText(campground), 'document');
        if (embedding) {
            campground.embedding = embedding;
            await campground.save();
            embedded++;
            console.log(`  embedded: ${campground.title}`);
        } else {
            skipped++;
            console.log(`  skipped (embedding failed): ${campground.title}`);
        }
    }

    console.log(`Done. Embedded ${embedded}, skipped ${skipped}.`);
    await mongoose.connection.close();
}

main();
