const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../../../../shared/middlewares/auth.middleware");
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

// --------------- INTERNAL API ROUTES ---------------
router.get("/api/supplier/products", productApiController.findByIds);
router.get("/api/supplier/products/active", productApiController.findAllActive);
router.get("/api/supplier/products/search", productApiController.search);
router.get("/api/supplier/products/:id", productApiController.findOne);
router.post("/api/supplier/products/:id/check-stock", productApiController.checkStock);
router.post("/api/supplier/products/:id/reduce-stock", productApiController.reduceStock);
router.post("/api/supplier/products/:id/restore-stock", productApiController.restoreStock);
router.get("/api/supplier/quotes", quoteApiController.findByRfqIds);
router.get("/api/supplier/quotes/:id", quoteApiController.findOne);
router.get("/api/supplier/contracts", contractApiController.findByIds);
router.get("/api/supplier/contracts/:id", contractApiController.findOne);
router.get("/api/supplier/contracts/count", contractApiController.count);

// Root redirect
router.get("/", (req, res) => res.redirect("/admin/"));

// Auth routes (public)
router.get("/admin/login", authController.loginForm);
router.post("/admin/login", authController.login);
router.get("/admin/register", authController.registerForm);
router.post("/admin/register", authController.register);
router.get("/admin/logout", authController.logout);

// Profile (authenticated)
router.get("/admin/profile", requireAuth, authController.profile);
router.post("/admin/profile", requireAuth, authController.updateProfile);
router.post("/admin/profile/password", requireAuth, authController.changePassword);

// Supplier Dashboard
router.get("/admin/", requireAuth, (req, res) => res.render("dashboard"));

// Supplier - Products CRUD
router.get("/admin/products", requireAuth, productController.findAll);
router.get("/admin/shop-preview", requireAuth, productController.shopPreview);
router.get("/admin/products/add", requireAuth, productController.createForm);
router.post("/admin/products", requireAuth, productController.create);
router.get("/admin/products/edit/:id", requireAuth, productController.editForm);
router.post("/admin/products/update/:id", requireAuth, productController.update);
router.post("/admin/products/delete/:id", requireAuth, writeLimiter, productController.remove);

// Supplier - RFQs
router.get("/admin/rfqs", requireAuth, rfqController.findAll);
router.get("/admin/rfqs/:id", requireAuth, rfqController.findOne);
router.post("/admin/rfqs/:id/quote", requireAuth, writeLimiter, rfqController.submitQuote);

// Supplier - Contracts
router.get("/admin/contracts", requireAuth, contractController.findAll);
router.get("/admin/contracts/:id", requireAuth, contractController.findOne);
router.post("/admin/contracts/:id/confirm", requireAuth, writeLimiter, contractController.confirm);
router.post("/admin/contracts/:id/cancel", requireAuth, writeLimiter, contractController.cancel);

// Supplier - Orders & Payments
router.get("/admin/orders", requireAuth, orderController.findAll);
router.get("/admin/orders/:id", requireAuth, orderController.findOne);
router.post("/admin/orders/:id/confirm", requireAuth, writeLimiter, orderController.confirm);
router.post("/admin/orders/:id/cancel", requireAuth, writeLimiter, orderController.cancel);
router.get("/admin/orders/:id/payment", requireAuth, paymentController.processForm);
router.post("/admin/orders/:id/payment", requireAuth, writeLimiter, paymentController.process);

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
