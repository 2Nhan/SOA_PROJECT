const Auth = require("../models/auth.model");

// Redirect to unified login on shop service
exports.loginForm = (req, res) => {
  res.redirect("/login");
};

// Keep POST handler as fallback (in case form is submitted directly)
exports.login = (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.redirect("/login");
  }

  Auth.login(email, password, (err, user) => {
    if (err) {
      return res.redirect("/login");
    }
    if (user.role !== "supplier" && user.role !== "admin") {
      return res.redirect("/login");
    }
    req.session.user = user;
    res.redirect("/admin/");
  });
};

// Redirect to unified register on shop service
exports.registerForm = (req, res) => {
  res.redirect("/register");
};

// Keep POST handler as fallback
exports.register = (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase().replace(/<[^>]*>/g, "");
  const full_name = (req.body.full_name || "").trim().replace(/<[^>]*>/g, "");
  const password = req.body.password || "";
  const confirm_password = req.body.confirm_password || "";
  const role = req.body.role === "supplier" ? "supplier" : "shop";

  if (!email || !full_name || !password) {
    return res.redirect("/register");
  }
  if (password.length < 6) {
    return res.redirect("/register");
  }
  if (password !== confirm_password) {
    return res.redirect("/register");
  }

  Auth.register({ email, full_name, password, role }, (err, user) => {
    if (err) {
      return res.redirect("/register");
    }
    res.redirect("/login");
  });
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
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
