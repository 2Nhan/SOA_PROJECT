const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const path = require("path");

const { applyStandardMiddlewares } = require("../../shared/middlewares/standard.middleware");
const { notFoundHandler, globalErrorHandler } = require("../../shared/middlewares/error.middleware");
const supplierRoutes = require("./src/routes/supplier.routes");

const app = express();
const PORT = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : "dev-session-secret-change-me");
const sessionDbPassword = process.env.SESSION_DB_PASSWORD || process.env.APP_DB_PASSWORD;

if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required in production");
}
if (!sessionDbPassword) {
    throw new Error("SESSION_DB_PASSWORD or APP_DB_PASSWORD is required");
}

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Standard middlewares
applyStandardMiddlewares(app);

// Session store — shared across all services via auth_db (Fix #14)
const sessionStore = new MySQLStore({
    host: process.env.SESSION_DB_HOST || process.env.APP_DB_HOST || "localhost",
    port: process.env.APP_DB_PORT || 3306,
    user: process.env.SESSION_DB_USER || process.env.APP_DB_USER || "admin",
    password: sessionDbPassword,
    database: process.env.SESSION_DB_NAME || "auth_db"
});

app.use(session({
    key: "b2b_session",
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.SESSION_COOKIE_SECURE === "true",
        sameSite: "lax"
    }
}));

// Make session user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.currentUser = req.session.user || null;
    res.locals.shopServiceUrl = process.env.SHOP_SERVICE_URL || "http://localhost:8080";
    next();
});

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "supplier", uptime: process.uptime() });
});

// Routes
app.use("/", supplierRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Start server
const server = app.listen(PORT, () => {
    console.log(`[Supplier Service] Running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
    console.log(`[Supplier] ${signal} received. Shutting down...`);
    server.close(() => {
        sessionStore.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
