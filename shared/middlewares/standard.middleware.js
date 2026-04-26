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
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:", "https:", "*.unsplash.com", "*.amazonaws.com"],
                connectSrc: ["'self'"],
            }
        },
        // Allow Cloud9 Preview and ALB health checks to embed in iframe
        frameguard: false
    }));

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    app.use(cors({
        origin: (origin, callback) => {
            // No Origin header (same-origin, server-to-server, curl) → allow
            if (!origin) return callback(null, true);
            // No ALLOWED_ORIGINS configured → allow all (permissive default)
            if (!allowedOrigins.length) return callback(null, true);
            // Check against whitelist
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
