const express = require("express");
const app = express();
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const dbConfig = require("./src/config/config");
const { applyStandardMiddlewares } = require("../../shared/middlewares/standard.middleware");
const { globalErrorHandler, notFoundHandler } = require("../../shared/middlewares/error.middleware");
const authRoutes = require("./src/routes/auth.routes");

// Apply standard middlewares
applyStandardMiddlewares(app);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0
}));

// Session setup
const sessionStore = new MySQLStore({
    host: dbConfig.HOST,
    port: dbConfig.PORT,
    user: dbConfig.USER,
    password: dbConfig.PASSWORD,
    database: process.env.SESSION_DB_NAME || dbConfig.DB,
    createDatabaseTable: true,
    schema: { tableName: "sessions" }
});

app.use(session({
    key: "b2b_session",
    secret: process.env.SESSION_SECRET || "b2b-shared-secret-key-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", service: "auth", uptime: process.uptime() }));

// Mount Auth Routes
app.use("/", authRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Startup & Graceful Shutdown
const PORT = process.env.PORT || 8082;
const server = app.listen(PORT, () => {
    console.log(`[Auth Service] Configured and running on port ${PORT}`);
});

const pool = require("./src/config/db");
function shutdown(signal) {
    server.close(() => { pool.end(() => { process.exit(0); }); });
    setTimeout(() => process.exit(1), 10000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
