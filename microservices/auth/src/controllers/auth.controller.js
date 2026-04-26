const Auth = require("../models/auth.model");

// ============ REST API (inter-service) ============

// GET /api/users?ids=1,2,3&fields=id,full_name
exports.findByIds = (req, res) => {
    const idsParam = req.query.ids || "";
    const ids = idsParam.split(",").map(Number).filter(id => id > 0);
    if (!ids.length) return res.json([]);

    const fields = (req.query.fields || "").split(",").filter(Boolean);

    Auth.findByIds(ids, fields, (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving users" });
        res.json(data);
    });
};

// GET /api/users/:id?fields=id,full_name
exports.findOneApi = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid user ID" });

    Auth.findById(id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "User not found" });
            return res.status(500).json({ error: "Error retrieving user" });
        }
        res.json(data);
    });
};

// GET /api/users/all — admin: list all users
exports.getAllUsersApi = (req, res) => {
    Auth.getAllUsers((err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving users" });
        res.json(data);
    });
};

// POST /api/users/:id/approve
exports.approveUserApi = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });
    Auth.approveUser(id, (err, data) => {
        if (err) return res.status(500).json({ error: "Error approving user" });
        res.json(data);
    });
};

// POST /api/users/:id/reject
exports.rejectUserApi = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });
    Auth.rejectUser(id, (err, data) => {
        if (err) return res.status(500).json({ error: "Error rejecting user" });
        res.json(data);
    });
};

// POST /api/users/:id/delete
exports.deleteUserApi = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });
    Auth.deleteUser(id, (err, data) => {
        if (err) {
            if (err.kind === "not_found_or_admin") return res.status(400).json({ error: "Cannot delete admin accounts" });
            return res.status(500).json({ error: "Error deleting user" });
        }
        res.json(data);
    });
};

// GET /api/users/stats — user counts for admin dashboard
exports.statsApi = (req, res) => {
    Auth.getUserCount((err, totalUsers) => {
        if (err) return res.status(500).json({ error: "Error getting stats" });
        Auth.getPendingUserCount((err, pendingUsers) => {
            if (err) return res.status(500).json({ error: "Error getting stats" });
            res.json({ totalUsers, pendingUsers });
        });
    });
};

// POST /api/auth/login — internal JSON login
exports.loginApi = (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    Auth.login(email, password, (err, user) => {
        if (err) {
            if (err.kind === "not_found") return res.status(401).json({ error: "Email not found" });
            if (err.kind === "wrong_password") return res.status(401).json({ error: "Incorrect password" });
            if (err.kind === "not_approved") return res.status(403).json({ error: "Account is " + err.status });
            return res.status(500).json({ error: "Login failed" });
        }
        res.json(user);
    });
};

// POST /api/auth/register — internal JSON register
exports.registerApi = (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase().replace(/<[^>]*>/g, "");
    const full_name = (req.body.full_name || "").trim().replace(/<[^>]*>/g, "");
    const password = req.body.password || "";
    const role = req.body.role === "supplier" ? "supplier" : "shop";

    if (!email || !full_name || !password) return res.status(400).json({ error: "All fields are required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    Auth.register({ email, full_name, password, role }, (err, user) => {
        if (err) {
            if (err.kind === "duplicate") return res.status(409).json({ error: "Email already registered" });
            return res.status(500).json({ error: "Registration failed" });
        }
        res.status(201).json(user);
    });
};

// ============ WEB UI (session-based) ============

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
        req.session.user = user;
        // Bắt buộc lưu session vào DB trước khi redirect để tránh Race Condition trên AWS
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.render("login", { error: "Login failed to persist" });
            }
            // Role-based redirect
            if (user.role === "supplier" || user.role === "admin") {
                const supplierUrl = process.env.SUPPLIER_SERVICE_URL || "http://localhost:8081";
                return res.redirect(supplierUrl + "/admin/");
            }
            const shopUrl = process.env.SHOP_SERVICE_URL || "http://localhost:8080";
            res.redirect(shopUrl + "/");
        });
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
