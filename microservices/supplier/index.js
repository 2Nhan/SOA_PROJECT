const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const dbConfig = require("./app/config/config");

const app = express();

// --------------- SECURITY ---------------

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many write operations. Please wait a moment."
});

// --------------- PERFORMANCE ---------------

app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// --------------- APP CONFIG ---------------

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0
}));

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

app.set("trust proxy", 1);

// --------------- SESSION (shared MySQL store) ---------------

const sessionStore = new MySQLStore({
  host: dbConfig.HOST,
  port: dbConfig.PORT,
  user: dbConfig.USER,
  password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  createDatabaseTable: true,
  schema: { tableName: "sessions" }
});

app.use(session({
  key: "b2b_session",
  secret: process.env.SESSION_SECRET || "b2b-shared-secret-key-change-in-production",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true only if using HTTPS (ALB with ACM certificate)
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// --------------- HEALTH CHECK ---------------

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "supplier",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// --------------- AUTH MIDDLEWARE ---------------

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  if (req.session.user.role !== "supplier" && req.session.user.role !== "admin") {
    return res.status(403).render("error", { message: "Access denied. Supplier or Admin account required." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).render("error", { message: "Access denied. Admin role required." });
  }
  next();
}

// --------------- ROUTES ---------------

const authController = require("./app/controller/auth.controller");
const productController = require("./app/controller/product.controller");
const orderController = require("./app/controller/order.controller");
const paymentController = require("./app/controller/payment.controller");
const rfqController = require("./app/controller/rfq.controller");
const contractController = require("./app/controller/contract.controller");
const adminController = require("./app/controller/admin.controller");

// Auth routes (public)
app.get("/admin/login", authController.loginForm);
app.post("/admin/login", authController.login);
app.get("/admin/register", authController.registerForm);
app.post("/admin/register", authController.register);
app.get("/admin/logout", authController.logout);

// Profile (authenticated)
app.get("/admin/profile", requireAuth, authController.profile);
app.post("/admin/profile", requireAuth, authController.updateProfile);
app.post("/admin/profile/password", requireAuth, authController.changePassword);

// Supplier Dashboard
app.get("/admin/", requireAuth, (req, res) => {
  res.render("dashboard");
});

// Supplier - Products CRUD
app.get("/admin/products", requireAuth, productController.findAll);
app.get("/admin/products/add", requireAuth, productController.createForm);
app.post("/admin/products", requireAuth, productController.create);
app.get("/admin/products/edit/:id", requireAuth, productController.editForm);
app.post("/admin/products/update/:id", requireAuth, productController.update);
app.post("/admin/products/delete/:id", requireAuth, writeLimiter, productController.remove);

// Supplier - RFQs (view + submit quote)
app.get("/admin/rfqs", requireAuth, rfqController.findAll);
app.get("/admin/rfqs/:id", requireAuth, rfqController.findOne);
app.post("/admin/rfqs/:id/quote", requireAuth, writeLimiter, rfqController.submitQuote);

// Supplier - Contracts
app.get("/admin/contracts", requireAuth, contractController.findAll);
app.get("/admin/contracts/:id", requireAuth, contractController.findOne);
app.post("/admin/contracts/:id/confirm", requireAuth, writeLimiter, contractController.confirm);
app.post("/admin/contracts/:id/cancel", requireAuth, writeLimiter, contractController.cancel);

// Supplier - Orders
app.get("/admin/orders", requireAuth, orderController.findAll);
app.get("/admin/orders/:id", requireAuth, orderController.findOne);
app.post("/admin/orders/:id/confirm", requireAuth, writeLimiter, orderController.confirm);
app.post("/admin/orders/:id/cancel", requireAuth, writeLimiter, orderController.cancel);

// Supplier - Payments
app.get("/admin/orders/:id/payment", requireAuth, paymentController.processForm);
app.post("/admin/orders/:id/payment", requireAuth, writeLimiter, paymentController.process);

// ---- ADMIN MANAGEMENT ROUTES (admin role only) ----
app.get("/admin/manage", requireAdmin, adminController.dashboard);
app.get("/admin/manage/users", requireAdmin, adminController.users);
app.post("/admin/manage/users/:id/approve", requireAdmin, writeLimiter, adminController.approveUser);
app.post("/admin/manage/users/:id/reject", requireAdmin, writeLimiter, adminController.rejectUser);
app.post("/admin/manage/users/:id/delete", requireAdmin, writeLimiter, adminController.deleteUser);
app.get("/admin/manage/products", requireAdmin, adminController.pendingProducts);
app.post("/admin/manage/products/:id/approve", requireAdmin, writeLimiter, adminController.approveProduct);
app.post("/admin/manage/products/:id/reject", requireAdmin, writeLimiter, adminController.rejectProduct);
app.post("/admin/manage/products/:id/delete", requireAdmin, writeLimiter, adminController.deleteProduct);
app.get("/admin/manage/rfqs", requireAdmin, adminController.rfqs);
app.get("/admin/manage/contracts", requireAdmin, adminController.contracts);

// --------------- ERROR HANDLING ---------------

app.use((req, res) => {
  res.status(404).render("error", { message: "Page not found" });
});

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${new Date().toISOString()} - ${err.stack}`);
  res.status(500).render("error", {
    message: process.env.NODE_ENV === "production"
      ? "Something went wrong. Please try again later."
      : err.message
  });
});

// --------------- SERVER START ---------------

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`[Supplier Service] Running on port ${PORT} | ENV: ${process.env.NODE_ENV || "development"}`);
});

// --------------- GRACEFUL SHUTDOWN ---------------

const pool = require("./app/config/db");

function shutdown(signal) {
  console.log(`[Supplier Service] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("[Supplier Service] HTTP server closed.");
    pool.end(() => {
      console.log("[Supplier Service] Database pool closed.");
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.error("[Supplier Service] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
