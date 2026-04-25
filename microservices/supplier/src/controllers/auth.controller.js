const authService = require("../../../shared/clients/auth.client");

// Render supplier login form
exports.loginForm = (req, res) => {
  res.render("login", { error: null });
};

// Handle login POST — via Auth API
exports.login = async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.render("login", { error: "Email and password are required" });
  }

  try {
    const user = await authService.loginUser(email, password);
    if (user.role !== "supplier" && user.role !== "admin") {
      return res.render("login", { error: "Access denied. Supplier or Admin account required." });
    }
    req.session.user = user;
    res.redirect("/admin/");
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("Email not found")) return res.render("login", { error: "Email not found" });
    if (msg.includes("Incorrect password")) return res.render("login", { error: "Incorrect password" });
    if (msg.includes("Account is")) return res.render("login", { error: "Your account is pending. Please wait for admin approval." });
    return res.render("login", { error: "Login failed. Auth service may be unavailable." });
  }
};

// Render supplier register form
exports.registerForm = (req, res) => {
  res.render("register", { error: null });
};

// Handle register POST — via Auth API
exports.register = async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase().replace(/<[^>]*>/g, "");
  const full_name = (req.body.full_name || "").trim().replace(/<[^>]*>/g, "");
  const password = req.body.password || "";
  const confirm_password = req.body.confirm_password || "";
  const role = req.body.role === "supplier" ? "supplier" : "shop";

  if (!email || !full_name || !password) {
    return res.render("register", { error: "All fields are required" });
  }
  if (password.length < 6) {
    return res.render("register", { error: "Password must be at least 6 characters" });
  }
  if (password !== confirm_password) {
    return res.render("register", { error: "Passwords do not match" });
  }

  try {
    await authService.registerUser({ email, full_name, password, role });
    res.render("login", { error: "Registration successful! Please wait for admin approval before logging in." });
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("already registered")) return res.render("register", { error: "Email already registered" });
    return res.render("register", { error: "Registration failed. Auth service may be unavailable." });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
};

exports.profile = async (req, res) => {
  try {
    const user = await authService.getUserById(req.session.user.id);
    res.render("profile", { user, success: null, error: null });
  } catch (err) {
    res.status(500).render("error", { message: "Error loading profile" });
  }
};

exports.updateProfile = async (req, res) => {
  const full_name = (req.body.full_name || "").trim().replace(/<[^>]*>/g, "");
  const email = (req.body.email || "").trim().toLowerCase().replace(/<[^>]*>/g, "");

  if (!full_name || !email) {
    const user = await authService.getUserById(req.session.user.id);
    return res.render("profile", { user: user || req.session.user, success: null, error: "Name and email are required" });
  }

  // Profile update still goes through Auth service's REST API
  // For now, keep using session user data since no direct profile update API
  // The profile page is handled by Auth service directly
  try {
    const user = await authService.getUserById(req.session.user.id);
    res.render("profile", { user: user || req.session.user, success: null, error: "Please update your profile via the Auth service." });
  } catch (err) {
    res.status(500).render("error", { message: "Error updating profile" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await authService.getUserById(req.session.user.id);
    res.render("profile", { user: user || req.session.user, success: null, error: "Please change your password via the Auth service." });
  } catch (err) {
    res.status(500).render("error", { message: "Error changing password" });
  }
};
