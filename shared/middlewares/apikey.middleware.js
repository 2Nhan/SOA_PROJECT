/**
 * Internal API Key Middleware
 * Protects internal service-to-service API endpoints
 */

function requireApiKey(req, res, next) {
    const expectedKey = process.env.INTERNAL_API_KEY;
    const apiKey = req.headers["x-api-key"];

    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
        return res.status(403).json({ error: "Forbidden: Invalid or missing API key" });
    }

    next();
}

module.exports = { requireApiKey };
