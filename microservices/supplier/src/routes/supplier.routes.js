const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin, requireSupplier, requireSupplierOrAdmin } = require("../../../../shared/middlewares/auth.middleware");
const { requireApiKey } = require("../../../../shared/middlewares/apikey.middleware");
const rateLimit = require("express-rate-limit");

const writeLimiter = rateLimit({
    windowMs: 60 * 1000, max: 20,
    message: "Too many write operations. Please wait a moment."
});

// Import controllers
const authController = require("../controllers/auth.controller");
const productController = require("../controllers/product.controller");
const orderController = require("../controllers/order.controller");
const paymentController = require("../controllers/payment.controller");
const rfqController = require("../controllers/rfq.controller");
const contractController = require("../controllers/contract.controller");
const adminController = require("../controllers/admin.controller");

// Internal API controllers
const productApiController = require("../api/product.api");
const quoteApiController = require("../api/quote.api");
const contractApiController = require("../api/contract.api");

// --------------- INTERNAL API ROUTES (protected by API key) ---------------
router.get("/api/supplier/products", requireApiKey, productApiController.findByIds);
router.get("/api/supplier/products/active", requireApiKey, productApiController.findAllActive);
router.get("/api/supplier/products/search", requireApiKey, productApiController.search);
router.get("/api/supplier/products/:id", requireApiKey, productApiController.findOne);
router.post("/api/supplier/products/:id/check-stock", requireApiKey, productApiController.checkStock);
router.post("/api/supplier/products/:id/reduce-stock", requireApiKey, productApiController.reduceStock);
router.post("/api/supplier/products/:id/restore-stock", requireApiKey, productApiController.restoreStock);
router.get("/api/supplier/quotes", requireApiKey, quoteApiController.findByRfqIds);
router.get("/api/supplier/quotes/:id", requireApiKey, quoteApiController.findOne);
router.post("/api/supplier/quotes/:id/status", requireApiKey, quoteApiController.updateStatus);
router.get("/api/supplier/contracts", requireApiKey, contractApiController.findByIds);
router.get("/api/supplier/contracts/by-shop", requireApiKey, contractApiController.findByShopId);
router.get("/api/supplier/contracts/count", requireApiKey, contractApiController.count);
router.get("/api/supplier/contracts/:id", requireApiKey, contractApiController.findOne);
router.post("/api/supplier/contracts", requireApiKey, contractApiController.create);

// Root redirect
router.get("/", (req, res) => res.redirect("/admin/"));

// Auth routes (public)
router.get("/admin/login", authController.loginForm);
router.post("/admin/login", authController.login);
router.get("/admin/register", authController.registerForm);
router.post("/admin/register", authController.register);
router.get("/admin/logout", authController.logout);

// Profile (authenticated)
router.get("/admin/profile", requireSupplierOrAdmin, authController.profile);
router.post("/admin/profile", requireSupplierOrAdmin, authController.updateProfile);
router.post("/admin/profile/password", requireSupplierOrAdmin, authController.changePassword);

// Supplier Dashboard
router.get("/admin/", requireAuth, (req, res) => {
    if (req.session.user.role === "admin") return res.redirect("/admin/manage");
    if (req.session.user.role !== "supplier") {
        return res.status(403).render("error", { message: "Access denied. Supplier account required." });
    }
    res.render("dashboard");
});

// Supplier - Products CRUD
router.get("/admin/products", requireSupplier, productController.findAll);
router.get("/admin/shop-preview", requireSupplier, productController.shopPreview);
router.get("/admin/products/add", requireSupplier, productController.createForm);
router.post("/admin/products", requireSupplier, productController.create);
router.get("/admin/products/edit/:id", requireSupplier, productController.editForm);
router.post("/admin/products/update/:id", requireSupplier, productController.update);
router.post("/admin/products/delete/:id", requireSupplier, writeLimiter, productController.remove);

// Supplier - RFQs
router.get("/admin/rfqs", requireSupplier, rfqController.findAll);
router.get("/admin/rfqs/:id", requireSupplier, rfqController.findOne);
router.post("/admin/rfqs/:id/quote", requireSupplier, writeLimiter, rfqController.submitQuote);

// Supplier - Contracts
router.get("/admin/contracts", requireSupplier, contractController.findAll);
router.get("/admin/contracts/:id", requireSupplier, contractController.findOne);
router.post("/admin/contracts/:id/confirm", requireSupplier, writeLimiter, contractController.confirm);
router.post("/admin/contracts/:id/cancel", requireSupplier, writeLimiter, contractController.cancel);

// Supplier - Orders & Payments
router.get("/admin/orders", requireSupplier, orderController.findAll);
router.get("/admin/orders/:id", requireSupplier, orderController.findOne);
router.post("/admin/orders/:id/confirm", requireSupplier, writeLimiter, orderController.confirm);
router.post("/admin/orders/:id/cancel", requireSupplier, writeLimiter, orderController.cancel);
router.get("/admin/orders/:id/payment", requireSupplier, paymentController.processForm);
router.post("/admin/orders/:id/payment", requireSupplier, writeLimiter, paymentController.process);

// ---- ADMIN MANAGEMENT ROUTES ----
router.get("/admin/manage", requireAdmin, adminController.dashboard);
router.get("/admin/manage/users", requireAdmin, adminController.users);
router.post("/admin/manage/users/:id/approve", requireAdmin, writeLimiter, adminController.approveUser);
router.post("/admin/manage/users/:id/reject", requireAdmin, writeLimiter, adminController.rejectUser);
router.post("/admin/manage/users/:id/delete", requireAdmin, writeLimiter, adminController.deleteUser);
router.get("/admin/manage/products", requireAdmin, adminController.pendingProducts);
router.post("/admin/manage/products/:id/approve", requireAdmin, writeLimiter, adminController.approveProduct);
router.post("/admin/manage/products/:id/reject", requireAdmin, writeLimiter, adminController.rejectProduct);
router.post("/admin/manage/products/:id/delete", requireAdmin, writeLimiter, adminController.deleteProduct);
router.get("/admin/manage/rfqs", requireAdmin, adminController.rfqs);
router.get("/admin/manage/contracts", requireAdmin, adminController.contracts);

module.exports = router;
