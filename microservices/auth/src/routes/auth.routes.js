const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../../../shared/middlewares/auth.middleware");
const { requireInternalApiKey } = require("../../../../shared/middlewares/internal-api.middleware");

// Import controllers
const authController = require("../controllers/auth.controller");

// --------------- REST API ROUTES (protected by internal API key) ---------------
router.get("/api/auth/users", requireInternalApiKey, authController.findByIds);
router.get("/api/auth/users/all", requireInternalApiKey, authController.getAllUsersApi);
router.get("/api/auth/users/stats", requireInternalApiKey, authController.statsApi);
router.get("/api/auth/users/:id", requireInternalApiKey, authController.findOneApi);
router.post("/api/auth/users/:id/approve", requireInternalApiKey, authController.approveUserApi);
router.post("/api/auth/users/:id/reject", requireInternalApiKey, authController.rejectUserApi);
router.post("/api/auth/users/:id/delete", requireInternalApiKey, authController.deleteUserApi);
router.post("/api/auth/login", authController.loginApi);
router.post("/api/auth/register", authController.registerApi);

// --------------- WEB UI ROUTES ---------------
router.get("/login", authController.loginForm);
router.post("/login", authController.login);
router.get("/register", authController.registerForm);
router.post("/register", authController.register);
router.get("/logout", authController.logout);

// Profile (authenticated)
router.get("/profile", requireAuth, authController.profile);
router.post("/profile", requireAuth, authController.updateProfile);
router.post("/profile/password", requireAuth, authController.changePassword);

module.exports = router;
