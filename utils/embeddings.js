// utils/embeddings.js
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const EMBEDDING_MODEL = 'voyage-3.5';
const EMBEDDING_DIMENSIONS = 1024;

async function getEmbedding(text, inputType = 'document') {
    if (!process.env.VOYAGE_API_KEY || !text) return null;

    const maxRetries = 5;
    let attempt = 0;
    let delay = 2000;

    while (attempt < maxRetries) {
        try {
            const res = await fetch(VOYAGE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`
                },
                body: JSON.stringify({
                    input: [text],
                    model: EMBEDDING_MODEL,
                    input_type: inputType,
                    output_dimension: EMBEDDING_DIMENSIONS
                })
            });

            if (!res.ok) {
                const errorText = await res.text();
                if (res.status === 429) {
                    console.log(`⏳ Rate limit hit. Waiting ${delay/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    attempt++;
                    continue;
                }
                console.error('Voyage embedding request failed:', res.status, errorText);
                return null;
            }

            const data = await res.json();
            return data.data[0].embedding;
        } catch (err) {
            console.error('Voyage embedding request errored:', err.message);
            attempt++;
            if (attempt < maxRetries) {
                console.log(`⏳ Network error, retrying in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                return null;
            }
        }
    }
    return null;
}

function buildEmbeddingText(campground) {
    return [campground.title, campground.location, campground.description]
        .filter(Boolean)
        .join('. ');
}

module.exports = {
    getEmbedding,
    buildEmbeddingText,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS
};