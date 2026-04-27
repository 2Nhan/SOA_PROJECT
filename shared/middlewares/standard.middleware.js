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
    // Middleware để "cắt đuôi" prefix từ Load Balancer (ALB)
    app.use((req, res, next) => {
        const prefixes = ["/api/auth", "/api/shop", "/api/supplier"];
        for (const prefix of prefixes) {
            if (req.url.startsWith(prefix)) {
                req.url = req.url.slice(prefix.length) || "/";
                break;
            }
        }
        next();
    });

    const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
    delete directives["upgrade-insecure-requests"]; // Xóa bỏ hoàn toàn việc ép HTTPS

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...directives,
                "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
                "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
                "img-src": ["'self'", "data:", "https:"],
                "connect-src": ["'self'"],
            }
        },
        hsts: false
    }));

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
    app.use(cors({
        origin: allowedOrigins.length > 0 ? allowedOrigins : true, // Fallback to true for development/ALB testing
        credentials: true,
        methods: ["GET", "POST"]
    }));

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests from this IP, please try again later.",
        skip: (req) => req.headers["x-internal-api-key"] ? true : false
    });
    app.use(limiter);

    app.use(compression());
    app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(express.json({ limit: "1mb" }));

    app.set("trust proxy", 1);
};
