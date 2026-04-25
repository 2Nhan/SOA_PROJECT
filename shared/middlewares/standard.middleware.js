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
    app.use(helmet({ contentSecurityPolicy: false }));

    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS || "*",
        methods: ["GET", "POST"]
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
