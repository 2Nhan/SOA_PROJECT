/**
 * Internal API Key Middleware
 * Protects inter-service API endpoints from unauthorized external access.
 * Services must include X-Internal-Api-Key header in requests.
 */

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "b2b-internal-key-change-in-production";

function requireInternalApiKey(req, res, next) {
    const apiKey = req.headers["x-internal-api-key"];
    if (!apiKey || apiKey !== INTERNAL_API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid or missing internal API key" });
    }
    next();
}

module.exports = { requireInternalApiKey };
