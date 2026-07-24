// scripts/backfillEmbeddings.js
require('dotenv').config();
const mongoose = require('mongoose');
const Campground = require('../models/campground');
const { getEmbedding, buildEmbeddingText } = require('../utils/embeddings');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
            console.log(`  ✅ embedded: ${campground.title}`);
        } else {
            skipped++;
            console.log(`  ❌ skipped (embedding failed): ${campground.title}`);
        }
        // Wait 20 seconds between requests to respect 3 RPM limit
        await delay(20000);
    }

    console.log(`Done. Embedded ${embedded}, skipped ${skipped}.`);
    await mongoose.connection.close();
}

main();