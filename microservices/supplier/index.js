const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

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

// --------------- HEALTH CHECK ---------------

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "supplier",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// --------------- ROUTES ---------------

const productController = require("./app/controller/product.controller");
const orderController = require("./app/controller/order.controller");
const paymentController = require("./app/controller/payment.controller");
const rfqController = require("./app/controller/rfq.controller");
const contractController = require("./app/controller/contract.controller");
const adminController = require("./app/controller/admin.controller");

// Supplier Dashboard
app.get("/admin/", (req, res) => {
  res.render("dashboard");
});

// Supplier - Products CRUD
app.get("/admin/products", productController.findAll);
app.get("/admin/products/add", productController.createForm);
app.post("/admin/products", productController.create);
app.get("/admin/products/edit/:id", productController.editForm);
app.post("/admin/products/update/:id", productController.update);
app.post("/admin/products/delete/:id", writeLimiter, productController.remove);

// Supplier - RFQs (view + submit quote)
app.get("/admin/rfqs", rfqController.findAll);
app.get("/admin/rfqs/:id", rfqController.findOne);
app.post("/admin/rfqs/:id/quote", writeLimiter, rfqController.submitQuote);

// Supplier - Contracts
app.get("/admin/contracts", contractController.findAll);
app.get("/admin/contracts/:id", contractController.findOne);
app.post("/admin/contracts/:id/confirm", writeLimiter, contractController.confirm);
app.post("/admin/contracts/:id/cancel", writeLimiter, contractController.cancel);

// Supplier - Orders
app.get("/admin/orders", orderController.findAll);
app.get("/admin/orders/:id", orderController.findOne);
app.post("/admin/orders/:id/confirm", writeLimiter, orderController.confirm);
app.post("/admin/orders/:id/cancel", writeLimiter, orderController.cancel);

// Supplier - Payments
app.get("/admin/orders/:id/payment", paymentController.processForm);
app.post("/admin/orders/:id/payment", writeLimiter, paymentController.process);

// ---- ADMIN MANAGEMENT ROUTES ----
app.get("/admin/manage", adminController.dashboard);
app.get("/admin/manage/users", adminController.users);
app.post("/admin/manage/users/:id/approve", writeLimiter, adminController.approveUser);
app.post("/admin/manage/users/:id/reject", writeLimiter, adminController.rejectUser);
app.post("/admin/manage/users/:id/delete", writeLimiter, adminController.deleteUser);
app.get("/admin/manage/products", adminController.pendingProducts);
app.post("/admin/manage/products/:id/approve", writeLimiter, adminController.approveProduct);
app.post("/admin/manage/products/:id/reject", writeLimiter, adminController.rejectProduct);
app.post("/admin/manage/products/:id/delete", writeLimiter, adminController.deleteProduct);
app.get("/admin/manage/rfqs", adminController.rfqs);
app.get("/admin/manage/contracts", adminController.contracts);

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
