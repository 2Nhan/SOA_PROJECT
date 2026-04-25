/**
 * Shared Error Handling Middlewares
 */

function notFoundHandler(req, res) {
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(404).json({ error: "Route not found" });
    }
    res.status(404).render("error", { message: "Page not found" });
}

function globalErrorHandler(err, req, res, next) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${err.stack}`);

    const status = err.status || 500;
    const message = process.env.NODE_ENV === "production"
        ? "Something went wrong. Please try again later."
        : err.message;

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(status).json({ error: message });
    }

    res.status(status).render("error", { message });
}

module.exports = {
    notFoundHandler,
    globalErrorHandler
};
