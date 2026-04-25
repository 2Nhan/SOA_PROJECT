const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../../shared/middlewares/auth.middleware");

// Import controllers
const authController = require("../controllers/auth.controller");
const productController = require("../controllers/product.controller");
const orderController = require("../controllers/order.controller");
const rfqController = require("../controllers/rfq.controller");
const contractController = require("../controllers/contract.controller");
const shopApiController = require("../api/shop.api");
const rateLimit = require("express-rate-limit");

const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many orders submitted. Please wait a moment."
});

// --------------- INTERNAL API ROUTES ---------------
router.get("/api/rfqs", shopApiController.findRfqs);
router.get("/api/rfqs/all", shopApiController.findAllRfqs);
router.get("/api/rfqs/:id", shopApiController.findOneRfq);
router.post("/api/rfqs/:id/status", shopApiController.updateRfqStatus);
router.get("/api/orders/all", shopApiController.findAllOrders);
router.get("/api/orders/:id", shopApiController.findOneOrder);
router.post("/api/orders/:id/status", shopApiController.updateOrderStatus);
router.get("/api/stats", shopApiController.stats);

// Auth routes (public)
router.get("/login", authController.loginForm);
router.post("/login", authController.login);
router.get("/register", authController.registerForm);
router.post("/register", authController.register);
router.get("/logout", authController.logout);

// Profile (authenticated)
router.get("/profile", requireAuth, authController.profile);
router.post("/profile", requireAuth, authController.updateProfile);
router.post("/profile/password", requireAuth, authController.changePassword);

// Home
router.get("/", requireAuth, (req, res) => {
    res.render("home");
});

// Products - read only
router.get("/products", requireAuth, productController.findAll);
router.get("/products/:id", requireAuth, productController.findOne);

// RFQs 
router.get("/rfqs", requireAuth, rfqController.findAll);
router.get("/rfqs/new/:productId", requireAuth, rfqController.createForm);
router.post("/rfqs", requireAuth, orderLimiter, rfqController.create);
router.get("/rfqs/:id", requireAuth, rfqController.findOne);
router.post("/rfqs/:id/accept/:quoteId", requireAuth, orderLimiter, rfqController.acceptQuote);
router.post("/rfqs/:id/reject/:quoteId", requireAuth, orderLimiter, rfqController.rejectQuote);

// Contracts
router.get("/contracts", requireAuth, contractController.findAll);
router.get("/contracts/:id", requireAuth, contractController.findOne);
router.post("/contracts/:id/order", requireAuth, orderLimiter, contractController.createOrder);

// Orders
router.get("/orders", requireAuth, orderController.findAll);
router.get("/orders/new/:productId", requireAuth, orderController.createForm);
router.post("/orders", requireAuth, orderLimiter, orderController.create);
router.get("/orders/:id", requireAuth, orderController.findOne);

module.exports = router;
