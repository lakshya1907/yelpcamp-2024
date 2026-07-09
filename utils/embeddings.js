const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const EMBEDDING_MODEL = 'voyage-3.5';
const EMBEDDING_DIMENSIONS = 1024; // must match the Atlas vector index definition

// Generates an embedding vector for a piece of text via Voyage AI.
// `inputType` should be 'document' when embedding campground listings and
// 'query' when embedding a user's search text - Voyage tunes the vector
// differently for each side of a retrieval pair, which meaningfully
// improves search relevance.
async function getEmbedding(text, inputType = 'document') {
    if (!process.env.VOYAGE_API_KEY || !text) return null;

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
            console.error('Voyage embedding request failed:', res.status, await res.text());
            return null;
        }

        const data = await res.json();
        return data.data[0].embedding;
    } catch (err) {
        console.error('Voyage embedding request errored:', err.message);
        return null;
    }
}

// Combines the fields worth searching on into one blob of text to embed.
function buildEmbeddingText(campground) {
    return [campground.title, campground.location, campground.description]
        .filter(Boolean)
        .join('. ');
}

module.exports = { getEmbedding, buildEmbeddingText, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
