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
  contentSecurityPolicy: false
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

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many orders submitted. Please wait a moment."
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

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

app.set("trust proxy", 1);

// --------------- HEALTH CHECK ---------------

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "shop",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// --------------- ROUTES ---------------

const productController = require("./app/controller/product.controller");
const orderController = require("./app/controller/order.controller");
const rfqController = require("./app/controller/rfq.controller");
const contractController = require("./app/controller/contract.controller");

// Home
app.get("/", (req, res) => {
  res.render("home");
});

// Products - read only (only show approved/active products)
app.get("/products", productController.findAll);
app.get("/products/:id", productController.findOne);

// RFQs - shop sends RFQ, reviews quotes
app.get("/rfqs", rfqController.findAll);
app.get("/rfqs/new/:productId", rfqController.createForm);
app.post("/rfqs", orderLimiter, rfqController.create);
app.get("/rfqs/:id", rfqController.findOne);
app.post("/rfqs/:id/accept/:quoteId", orderLimiter, rfqController.acceptQuote);
app.post("/rfqs/:id/reject/:quoteId", orderLimiter, rfqController.rejectQuote);

// Contracts
app.get("/contracts", contractController.findAll);
app.get("/contracts/:id", contractController.findOne);
app.post("/contracts/:id/order", orderLimiter, contractController.createOrder);

// Orders - create + read
app.get("/orders", orderController.findAll);
app.get("/orders/new/:productId", orderController.createForm);
app.post("/orders", orderLimiter, orderController.create);
app.get("/orders/:id", orderController.findOne);

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
  console.log(`[Shop Service] Running on port ${PORT} | ENV: ${process.env.NODE_ENV || "development"}`);
});

// --------------- GRACEFUL SHUTDOWN ---------------

const pool = require("./app/config/db");

function shutdown(signal) {
  console.log(`[Shop Service] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("[Shop Service] HTTP server closed.");
    pool.end(() => {
      console.log("[Shop Service] Database pool closed.");
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.error("[Shop Service] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
