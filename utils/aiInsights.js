const { GoogleGenAI } = require('@google/genai');

let client = null;
function getClient() {
    if (!process.env.GEMINI_API_KEY) return null;
    if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return client;
}

function firstText(response) {
    return response?.text?.trim() || null;
}

// Helper: Retry with exponential backoff and fallback models
async function callWithRetry(model, contents, config, maxRetries = 3) {
    const genAI = getClient();
    if (!genAI) return null;

    let lastError = null;
    let delay = 1000; // start with 1 second

    // Ordered list of fallback models if primary is unavailable
    const fallbackModels = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await genAI.models.generateContent({
                model: model,
                contents: contents,
                config: config
            });
            return response;
        } catch (err) {
            lastError = err;
            const errorMsg = err.message || '';

            // Rate limit (429) – wait and retry with backoff
            if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
                console.log(`⚠️ Rate limit hit for ${model}. Waiting ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }

            // Service unavailable (503) – try next fallback model
            if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE')) {
                console.log(`⚠️ ${model} is overloaded. Trying fallback...`);
                const fallbackModel = fallbackModels.shift();
                if (fallbackModel) {
                    model = fallbackModel;
                    console.log(`🔄 Switching to ${model}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 1.5;
                    continue;
                }
            }

            // For 404 or other permanent errors, don't retry
            if (errorMsg.includes('404') || errorMsg.includes('NOT_FOUND')) {
                console.error(`❌ Model ${model} not found.`);
                throw err;
            }

            // Other errors – retry with backoff
            console.log(`⚠️ Attempt ${attempt + 1} failed. Retrying in ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }

    throw lastError;
}

// Summarizes a campground's reviews into a short, human-readable blurb
module.exports.summarizeReviews = async (reviews) => {
    const genAI = getClient();
    if (!genAI || !reviews || reviews.length === 0) return null;

    const reviewText = reviews
        .slice(0, 30)
        .map(r => `- (${r.rating}/5) ${r.body}`)
        .join('\n');

    try {
        const response = await callWithRetry(
            'gemini-3.5-flash',
            `Summarize these campground reviews in 2-3 sentences for a prospective visitor. Mention common praise and common complaints if any exist. Do not quote any review verbatim, and do not mention star ratings directly.\n\nReviews:\n${reviewText}`,
            { maxOutputTokens: 200 }
        );
        return firstText(response);
    } catch (err) {
        console.error('AI review summary failed:', err.message);
        return null;
    }
};

const ASPECT_CATEGORIES = ['cleanliness', 'location', 'host_quality', 'wifi', 'value'];

// Breaks down a campground's reviews into category-level sentiment
module.exports.analyzeReviewAspects = async (reviews) => {
    const genAI = getClient();
    if (!genAI || !reviews || reviews.length === 0) return null;

    const reviewText = reviews
        .slice(0, 150)
        .map((r, i) => `${i + 1}. (${r.rating}/5) ${r.body}`)
        .join('\n');

    try {
        const response = await callWithRetry(
            'gemini-3.5-flash',
            `Analyze these campground reviews and break them down by category: cleanliness, location, host quality, wifi, and value.

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
${reviewText}`,
            { maxOutputTokens: 600 }
        );

        const text = firstText(response);
        if (!text) return null;

        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

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

// Splits a conversational search query into a clean semantic phrase plus max price filter
module.exports.parseSearchQuery = async (query) => {
    const genAI = getClient();
    if (!genAI) return { semanticQuery: query, maxPrice: null };

    try {
        const response = await callWithRetry(
            'gemini-3.5-flash',
            `A user is searching for a campground with this query: "${query}"

If they mention a budget or price ceiling (e.g. "under 5000", "under ₹5,000", "less than $100"), extract just the number as maxPrice. Otherwise maxPrice is null.

Rewrite the rest of the query as a clean natural-language description of what they're looking for, with the price/budget wording removed.

Respond with ONLY JSON, no other text: {"semanticQuery": "...", "maxPrice": number|null}`,
            { maxOutputTokens: 150 }
        );

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

// Classifies a single review's sentiment
module.exports.analyzeSentiment = async (body) => {
    const genAI = getClient();
    if (!genAI || !body) return null;

    try {
        const response = await callWithRetry(
            'gemini-3.5-flash',
            `Classify the sentiment of this campground review. Reply with exactly one word: positive, neutral, or negative.\n\nReview: "${body}"`,
            { maxOutputTokens: 10 }
        );

        const text = firstText(response)?.toLowerCase().replace(/[^a-z]/g, '');
        return ['positive', 'neutral', 'negative'].includes(text) ? text : null;
    } catch (err) {
        console.error('AI sentiment analysis failed:', err.message);
        return null;
    }
};