const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../../shared/middlewares/auth.middleware");

// Import controllers
const authController = require("../controllers/auth.controller");

// --------------- REST API ROUTES ---------------
router.get("/api/users", authController.findByIds);
router.get("/api/users/all", authController.getAllUsersApi);
router.get("/api/users/stats", authController.statsApi);
router.get("/api/users/:id", authController.findOneApi);
router.post("/api/users/:id/approve", authController.approveUserApi);
router.post("/api/users/:id/reject", authController.rejectUserApi);
router.post("/api/users/:id/delete", authController.deleteUserApi);
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
