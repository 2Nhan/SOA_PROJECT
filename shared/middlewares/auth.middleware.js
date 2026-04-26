/**
 * Shared Auth Middleware
 * For role-based access control and session verification across microservices.
 */

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        // If the request expects JSON (like internal API calls), return 401
        if (req.headers.accept && req.headers.accept.includes("application/json")) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Otherwise redirect depending on context
        const loginUrl = req.originalUrl.startsWith("/admin") ? "/admin/login" : "/login";
        return res.redirect(loginUrl);
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        if (req.headers.accept && req.headers.accept.includes("application/json")) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        return res.redirect("/admin/login");
    }

    if (req.session.user.role !== "admin") {
        if (req.headers.accept && req.headers.accept.includes("application/json")) {
            return res.status(403).json({ error: "Forbidden" });
        }
        return res.status(403).render("error", { message: "Access denied. Admins only." });
    }

    next();
}

module.exports = {
    requireAuth,
    requireAdmin
};
