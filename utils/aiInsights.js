const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

function firstText(response) {
    const block = response.content.find(b => b.type === 'text');
    return block ? block.text.trim() : null;
}

// Summarizes a campground's reviews into a short, human-readable blurb
// highlighting recurring themes (both praise and complaints).
module.exports.summarizeReviews = async (reviews) => {
    const anthropic = getClient();
    if (!anthropic || !reviews || reviews.length === 0) return null;

    const reviewText = reviews
        .slice(0, 30) // cap input size for cost/latency
        .map(r => `- (${r.rating}/5) ${r.body}`)
        .join('\n');

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 200,
            messages: [{
                role: 'user',
                content: `Summarize these campground reviews in 2-3 sentences for a prospective visitor. Mention common praise and common complaints if any exist. Do not quote any review verbatim, and do not mention star ratings directly.\n\nReviews:\n${reviewText}`
            }]
        });
        return firstText(response);
    } catch (err) {
        console.error('AI review summary failed:', err.message);
        return null;
    }
};

// Breaks down a campground's reviews into category-level sentiment
// (cleanliness, location, host quality, wifi, value). Returns an object
// keyed by category, or null if unavailable/failed.
const ASPECT_CATEGORIES = ['cleanliness', 'location', 'host_quality', 'wifi', 'value'];

module.exports.analyzeReviewAspects = async (reviews) => {
    const anthropic = getClient();
    if (!anthropic || !reviews || reviews.length === 0) return null;

    // Cap input size for cost/latency/context-window safety. For a review
    // set that routinely runs into the hundreds, the production-grade next
    // step is a map-reduce pass (summarize in batches, then merge those
    // batch summaries) rather than one giant prompt - worth mentioning as
    // a scaling follow-up.
    const reviewText = reviews
        .slice(0, 150)
        .map((r, i) => `${i + 1}. (${r.rating}/5) ${r.body}`)
        .join('\n');

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 600,
            messages: [{
                role: 'user',
                content: `Analyze these campground reviews and break them down by category: cleanliness, location, host quality, wifi, and value.

For each category, determine the overall sentiment reviewers expressed (positive, negative, mixed, or not_mentioned if reviewers didn't discuss it) and write one short sentence summarizing what was said. Do not quote reviews verbatim.

Respond with ONLY valid JSON, no other text, in exactly this shape:
{
  "cleanliness": {"sentiment": "positive|negative|mixed|not_mentioned", "summary": "..."},
  "location": {"sentiment": "positive|negative|mixed|not_mentioned", "summary": "..."},
  "host_quality": {"sentiment": "positive|negative|mixed|not_mentioned", "summary": "..."},
  "wifi": {"sentiment": "positive|negative|mixed|not_mentioned", "summary": "..."},
  "value": {"sentiment": "positive|negative|mixed|not_mentioned", "summary": "..."}
}

Reviews:
${reviewText}`
            }]
        });

        const text = firstText(response);
        if (!text) return null;

        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Defensive normalization - never let a malformed AI response
        // produce a broken UI.
        const result = {};
        for (const cat of ASPECT_CATEGORIES) {
            const entry = parsed[cat];
            result[cat] = (entry && typeof entry.sentiment === 'string')
                ? { sentiment: entry.sentiment, summary: entry.summary || null }
                : { sentiment: 'not_mentioned', summary: null };
        }
        return result;
    } catch (err) {
        console.error('AI aspect analysis failed:', err.message);
        return null;
    }
};

// Splits a conversational search query into a clean semantic phrase plus
// any structured filter it implies (currently: a maximum price). Falls back
// to using the raw query with no filter if AI parsing is unavailable/fails -
// vector search still works fine on the raw text either way.
module.exports.parseSearchQuery = async (query) => {
    const anthropic = getClient();
    if (!anthropic) return { semanticQuery: query, maxPrice: null };

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
                role: 'user',
                content: `A user is searching for a campground with this query: "${query}"

If they mention a budget or price ceiling (e.g. "under 5000", "under ₹5,000", "less than $100"), extract just the number as maxPrice. Otherwise maxPrice is null.

Rewrite the rest of the query as a clean natural-language description of what they're looking for, with the price/budget wording removed.

Respond with ONLY JSON, no other text: {"semanticQuery": "...", "maxPrice": number|null}`
            }]
        });
        const text = firstText(response);
        if (!text) return { semanticQuery: query, maxPrice: null };
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            semanticQuery: parsed.semanticQuery || query,
            maxPrice: typeof parsed.maxPrice === 'number' ? parsed.maxPrice : null
        };
    } catch (err) {
        console.error('Search query parsing failed:', err.message);
        return { semanticQuery: query, maxPrice: null };
    }
};

// Classifies a single review's sentiment. Returns 'positive' | 'neutral' |
// 'negative', or null if the AI call fails or is unavailable.
module.exports.analyzeSentiment = async (body) => {
    const anthropic = getClient();
    if (!anthropic || !body) return null;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            messages: [{
                role: 'user',
                content: `Classify the sentiment of this campground review. Reply with exactly one word: positive, neutral, or negative.\n\nReview: "${body}"`
            }]
        });
        const text = firstText(response)?.toLowerCase().replace(/[^a-z]/g, '');
        return ['positive', 'neutral', 'negative'].includes(text) ? text : null;
    } catch (err) {
        console.error('AI sentiment analysis failed:', err.message);
        return null;
    }
};
