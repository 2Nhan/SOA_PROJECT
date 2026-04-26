/**
 * Shared setup for standard middlewares like Helmet, CORS, and Body Parser
 */
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const express = require("express");
const rateLimit = require("express-rate-limit");

exports.applyStandardMiddlewares = (app) => {
    // Helmet with CSP enabled (Fix #12)
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https:", "*.unsplash.com", "*.amazonaws.com"],
                fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
                connectSrc: ["'self'"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"]
            }
        }
    }));

    // CORS with restricted origins (Fix #11)
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    app.use(cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (!allowedOrigins.length) return callback(null, false);
            return callback(null, allowedOrigins.includes(origin));
        },
        methods: ["GET", "POST"],
        credentials: true
    }));

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests from this IP, please try again later."
    });
    app.use(limiter);

    app.use(compression());
    app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(express.json({ limit: "1mb" }));

    app.set("trust proxy", 1);
};

/**
 * Sanitize input string — stronger XSS prevention (Fix #9)
 * Removes HTML tags, event handlers, javascript: URIs, and encoded payloads
 */
exports.sanitizeInput = (str) => {
    if (typeof str !== "string") return str;
    return str
        .replace(/<[^>]*>?/g, "")           // Remove HTML tags (including incomplete)
        .replace(/javascript\s*:/gi, "")     // Remove javascript: URIs
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // Remove event handlers like onclick="..."
        .replace(/on\w+\s*=\s*[^\s>]*/gi, "")        // Remove event handlers without quotes
        .replace(/&#?[a-z0-9]+;/gi, "")     // Remove HTML entities
        .trim();
};
