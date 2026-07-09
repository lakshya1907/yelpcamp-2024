// One-time setup: creates the Atlas Vector Search index that powers
// semantic search (see routes/campgrounds.js `/search`).
//
// Run once, after your .env is configured:
//   node scripts/createVectorIndex.js
//
// Requires an M0+ Atlas cluster (Atlas Search/Vector Search is available
// even on the free tier) - this will NOT work against a plain local
// mongod, since Vector Search is an Atlas-only feature.
require('dotenv').config();
const mongoose = require('mongoose');
const Campground = require('../models/campground');
const { EMBEDDING_DIMENSIONS } = require('../utils/embeddings');

async function main() {
    if (!process.env.DB_URL) {
        console.error('Missing DB_URL in .env');
        process.exit(1);
    }

    await mongoose.connect(process.env.DB_URL);
    console.log('Connected. Creating vector search index...');

    try {
        await Campground.collection.createSearchIndex({
            name: 'campground_vector_index',
            type: 'vectorSearch',
            definition: {
                fields: [
                    {
                        type: 'vector',
                        path: 'embedding',
                        numDimensions: EMBEDDING_DIMENSIONS,
                        similarity: 'cosine'
                    },
                    {
                        type: 'filter',
                        path: 'price'
                    }
                ]
            }
        });
        console.log('Index creation requested. It may take a minute or two to finish building.');
        console.log('Check status in Atlas UI: Database > Cluster0 > Search tab, or via Atlas Search > "campground_vector_index".');
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('Index already exists - nothing to do.');
        } else {
            console.error('Failed to create index:', err.message);
            console.log('\nIf this fails, create it manually in Atlas UI instead:');
            console.log('  Atlas > Database > Cluster0 > Search tab > Create Search Index > Vector Search > JSON Editor');
            console.log('  Index name: campground_vector_index, collection: campgrounds');
            console.log(JSON.stringify({
                fields: [
                    { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
                    { type: 'filter', path: 'price' }
                ]
            }, null, 2));
        }
    }

    await mongoose.connection.close();
}

main();
