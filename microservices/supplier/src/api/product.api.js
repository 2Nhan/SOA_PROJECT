/**
 * Product API Controller — Internal REST API for inter-service communication
 * Exposes product data for Shop service
 */
const Product = require("../models/product.model");

// GET /api/products?ids=1,2,3&fields=id,name,price
exports.findByIds = (req, res) => {
    const idsParam = req.query.ids || "";
    const ids = idsParam.split(",").map(Number).filter(id => id > 0);
    if (!ids.length) return res.json([]);

    Product.findByIds(ids, (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving products" });
        res.json(data);
    });
};

// GET /api/products/:id
exports.findOne = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid product ID" });

    Product.findById(id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "Product not found" });
            return res.status(500).json({ error: "Error retrieving product" });
        }
        res.json(data);
    });
};

// GET /api/products/active — all active products
exports.findAllActive = (req, res) => {
    Product.getAllActive((err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving products" });
        res.json(data);
    });
};

// GET /api/products/search?q=keyword
exports.search = (req, res) => {
    const keyword = (req.query.q || "").substring(0, 100);
    if (!keyword) return res.json([]);

    Product.search(keyword, (err, data) => {
        if (err) return res.status(500).json({ error: "Error searching products" });
        res.json(data);
    });
};

// POST /api/products/:id/reduce-stock — Saga step: reduce stock
exports.reduceStock = (req, res) => {
    const id = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity);
    if (isNaN(id) || isNaN(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Invalid product ID or quantity" });
    }

    Product.checkAndReduceStock(id, quantity, (err, data) => {
        if (err) {
            if (err.kind === "product_not_found") return res.status(404).json({ error: "Product not found or inactive" });
            if (err.kind === "insufficient_stock") return res.status(409).json({ error: "Insufficient stock", available: err.available });
            return res.status(500).json({ error: "Error reducing stock" });
        }
        res.json(data);
    });
};

// POST /api/products/:id/restore-stock — Saga compensating: restore stock
exports.restoreStock = (req, res) => {
    const id = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity);
    if (isNaN(id) || isNaN(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Invalid product ID or quantity" });
    }

    Product.restoreStock(id, quantity, (err, data) => {
        if (err) return res.status(500).json({ error: "Error restoring stock" });
        res.json(data);
    });
};

// POST /api/products/:id/check-stock
exports.checkStock = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid product ID" });

    Product.findById(id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "Product not found" });
            return res.status(500).json({ error: "Error checking stock" });
        }
        res.json({ id: data.id, stock: data.stock, price: data.price, status: data.status });
    });
};
