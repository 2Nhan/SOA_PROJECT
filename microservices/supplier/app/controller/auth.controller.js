const Auth = require("../models/auth.model");

exports.loginForm = (req, res) => {
  res.render("login", { error: null });
};

exports.login = (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.render("login", { error: "Email and password are required" });
  }

  Auth.login(email, password, (err, user) => {
    if (err) {
      if (err.kind === "not_found") return res.render("login", { error: "Email not found" });
      if (err.kind === "wrong_password") return res.render("login", { error: "Incorrect password" });
      if (err.kind === "not_approved") return res.render("login", { error: "Your account is " + err.status + ". Please wait for admin approval." });
      return res.render("login", { error: "Login failed" });
    }
    if (user.role !== "supplier" && user.role !== "admin") {
      return res.render("login", { error: "Access denied. Supplier or Admin account required." });
    }
    req.session.user = user;
    res.redirect("/admin/");
  });
};

exports.registerForm = (req, res) => {
  res.render("register", { error: null });
};

exports.register = (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase().replace(/<[^>]*>/g, "");
  const full_name = (req.body.full_name || "").trim().replace(/<[^>]*>/g, "");
  const password = req.body.password || "";
  const confirm_password = req.body.confirm_password || "";
  const role = req.body.role === "admin" ? "admin" : "supplier";

  if (!email || !full_name || !password) {
    return res.render("register", { error: "All fields are required" });
  }
  if (password.length < 6) {
    return res.render("register", { error: "Password must be at least 6 characters" });
  }
  if (password !== confirm_password) {
    return res.render("register", { error: "Passwords do not match" });
  }

  Auth.register({ email, full_name, password, role }, (err, user) => {
    if (err) {
      if (err.kind === "duplicate") return res.render("register", { error: "Email already registered" });
      return res.render("register", { error: "Registration failed" });
    }
    res.render("login", { error: "Registration successful! Please wait for admin approval before logging in." });
  });
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
};

exports.profile = (req, res) => {
  Auth.findById(req.session.user.id, (err, user) => {
    if (err) return res.status(500).render("error", { message: "Error loading profile" });
    res.render("profile", { user, success: null, error: null });
  });
};

exports.updateProfile = (req, res) => {
  const full_name = (req.body.full_name || "").trim().replace(/<[^>]*>/g, "");
  const email = (req.body.email || "").trim().toLowerCase().replace(/<[^>]*>/g, "");

  if (!full_name || !email) {
    return Auth.findById(req.session.user.id, (err, user) => {
      res.render("profile", { user: user || req.session.user, success: null, error: "Name and email are required" });
    });
  }

  Auth.updateProfile(req.session.user.id, { full_name, email }, (err) => {
    if (err) {
      if (err.kind === "duplicate") {
        return Auth.findById(req.session.user.id, (e, user) => {
          res.render("profile", { user: user || req.session.user, success: null, error: "Email already in use" });
        });
      }
      return res.status(500).render("error", { message: "Error updating profile" });
    }
    req.session.user.full_name = full_name;
    req.session.user.email = email;
    Auth.findById(req.session.user.id, (e, user) => {
      res.render("profile", { user: user || req.session.user, success: "Profile updated successfully", error: null });
    });
  });
};

exports.changePassword = (req, res) => {
  const old_password = req.body.old_password || "";
  const new_password = req.body.new_password || "";
  const confirm_password = req.body.confirm_password || "";

  if (!old_password || !new_password) {
    return Auth.findById(req.session.user.id, (e, user) => {
      res.render("profile", { user: user || req.session.user, success: null, error: "All password fields are required" });
    });
  }
  if (new_password.length < 6) {
    return Auth.findById(req.session.user.id, (e, user) => {
      res.render("profile", { user: user || req.session.user, success: null, error: "New password must be at least 6 characters" });
    });
  }
  if (new_password !== confirm_password) {
    return Auth.findById(req.session.user.id, (e, user) => {
      res.render("profile", { user: user || req.session.user, success: null, error: "New passwords do not match" });
    });
  }

  Auth.changePassword(req.session.user.id, old_password, new_password, (err) => {
    if (err) {
      if (err.kind === "wrong_password") {
        return Auth.findById(req.session.user.id, (e, user) => {
          res.render("profile", { user: user || req.session.user, success: null, error: "Current password is incorrect" });
        });
      }
      return res.status(500).render("error", { message: "Error changing password" });
    }
    Auth.findById(req.session.user.id, (e, user) => {
      res.render("profile", { user: user || req.session.user, success: "Password changed successfully", error: null });
    });
  });
};
