const authService = require("../../../../shared/clients/auth.client");

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
    res.redirect(user.role === "admin" ? "/admin/manage" : "/admin/");
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
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    return res.render("profile", { user, success: null, error: "Name and email are required" });
  }

  try {
    await authService.updateUserProfile(req.session.user.id, { full_name, email });
    req.session.user.full_name = full_name;
    req.session.user.email = email;
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    res.render("profile", { user, success: "Profile updated successfully", error: null });
  } catch (err) {
    const msg = err.message || "";
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    if (msg.includes("already in use")) return res.render("profile", { user, success: null, error: "Email already in use" });
    res.render("profile", { user, success: null, error: "Error updating profile" });
  }
};

exports.changePassword = async (req, res) => {
  const old_password = req.body.old_password || "";
  const new_password = req.body.new_password || "";
  const confirm_password = req.body.confirm_password || "";

  if (!old_password || !new_password) {
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    return res.render("profile", { user, success: null, error: "All password fields are required" });
  }
  if (new_password.length < 6) {
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    return res.render("profile", { user, success: null, error: "New password must be at least 6 characters" });
  }
  if (new_password !== confirm_password) {
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    return res.render("profile", { user, success: null, error: "New passwords do not match" });
  }

  try {
    await authService.changeUserPassword(req.session.user.id, { old_password, new_password });
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    res.render("profile", { user, success: "Password changed successfully", error: null });
  } catch (err) {
    const msg = err.message || "";
    const user = await authService.getUserById(req.session.user.id).catch(() => req.session.user);
    if (msg.includes("incorrect")) return res.render("profile", { user, success: null, error: "Current password is incorrect" });
    res.render("profile", { user, success: null, error: "Error changing password" });
  }
};
