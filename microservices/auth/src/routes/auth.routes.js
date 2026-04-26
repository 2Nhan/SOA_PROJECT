const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../../../shared/middlewares/auth.middleware");
const { requireApiKey } = require("../../../../shared/middlewares/apikey.middleware");

// Import controllers
const authController = require("../controllers/auth.controller");

// --------------- REST API ROUTES (protected by API key — Fix #6) ---------------
router.get("/api/auth/users", requireApiKey, authController.findByIds);
router.get("/api/auth/users/all", requireApiKey, authController.getAllUsersApi);
router.get("/api/auth/users/stats", requireApiKey, authController.statsApi);
router.get("/api/auth/users/:id", requireApiKey, authController.findOneApi);
router.post("/api/auth/users/:id/approve", requireApiKey, authController.approveUserApi);
router.post("/api/auth/users/:id/reject", requireApiKey, authController.rejectUserApi);
router.post("/api/auth/users/:id/delete", requireApiKey, authController.deleteUserApi);
router.post("/api/auth/users/:id/update-profile", requireApiKey, authController.updateProfileApi);
router.post("/api/auth/users/:id/change-password", requireApiKey, authController.changePasswordApi);
router.post("/api/auth/login", requireApiKey, authController.loginApi);
router.post("/api/auth/register", requireApiKey, authController.registerApi);

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
