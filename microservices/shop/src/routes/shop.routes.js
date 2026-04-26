const express = require("express");
const router = express.Router();
const { requireShop } = require("../../../../shared/middlewares/auth.middleware");
const { requireApiKey } = require("../../../../shared/middlewares/apikey.middleware");

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

// --------------- INTERNAL API ROUTES (protected by API key — Fix #7) ---------------
router.get("/api/shop/rfqs", requireApiKey, shopApiController.findRfqs);
router.get("/api/shop/rfqs/all", requireApiKey, shopApiController.findAllRfqs);
router.get("/api/shop/rfqs/:id", requireApiKey, shopApiController.findOneRfq);
router.post("/api/shop/rfqs/:id/status", requireApiKey, shopApiController.updateRfqStatus);
router.get("/api/shop/orders/all", requireApiKey, shopApiController.findAllOrders);
router.get("/api/shop/orders/:id", requireApiKey, shopApiController.findOneOrder);
router.post("/api/shop/orders/:id/status", requireApiKey, shopApiController.updateOrderStatus);
router.get("/api/shop/stats", requireApiKey, shopApiController.stats);

// Auth routes (public)
router.get("/login", authController.loginForm);
router.post("/login", authController.login);
router.get("/register", authController.registerForm);
router.post("/register", authController.register);
router.get("/logout", authController.logout);

// Profile (authenticated)
router.get("/profile", requireShop, authController.profile);
router.post("/profile", requireShop, authController.updateProfile);
router.post("/profile/password", requireShop, authController.changePassword);

// Home
router.get("/", requireShop, (req, res) => {
    res.render("home");
});

// Products - read only
router.get("/products", requireShop, productController.findAll);
router.get("/products/:id", requireShop, productController.findOne);

// RFQs 
router.get("/rfqs", requireShop, rfqController.findAll);
router.get("/rfqs/new/:productId", requireShop, rfqController.createForm);
router.post("/rfqs", requireShop, orderLimiter, rfqController.create);
router.get("/rfqs/:id", requireShop, rfqController.findOne);
router.post("/rfqs/:id/accept/:quoteId", requireShop, orderLimiter, rfqController.acceptQuote);
router.post("/rfqs/:id/reject/:quoteId", requireShop, orderLimiter, rfqController.rejectQuote);

// Contracts
router.get("/contracts", requireShop, contractController.findAll);
router.get("/contracts/:id", requireShop, contractController.findOne);
router.post("/contracts/:id/order", requireShop, orderLimiter, contractController.createOrder);

// Orders
router.get("/orders", requireShop, orderController.findAll);
router.get("/orders/new/:productId", requireShop, orderController.createForm);
router.post("/orders", requireShop, orderLimiter, orderController.create);
router.get("/orders/:id", requireShop, orderController.findOne);

module.exports = router;
