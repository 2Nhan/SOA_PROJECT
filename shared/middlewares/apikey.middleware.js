/**
 * Internal API Key Middleware
 * Protects internal service-to-service API endpoints
 *
 * In development (NODE_ENV !== "production"), if INTERNAL_API_KEY is not set,
 * the middleware allows requests through (open access for local docker run testing).
 * In production, both the server key and the request key must be present and match.
 */

function requireApiKey(req, res, next) {
    const expectedKey = process.env.INTERNAL_API_KEY;

    // In dev mode without a configured key, skip validation
    if (!expectedKey && process.env.NODE_ENV !== "production") {
        return next();
    }

    const apiKey = req.headers["x-api-key"];

    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
        return res.status(403).json({ error: "Forbidden: Invalid or missing API key" });
    }

    next();
}

module.exports = { requireApiKey };
