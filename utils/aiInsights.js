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
