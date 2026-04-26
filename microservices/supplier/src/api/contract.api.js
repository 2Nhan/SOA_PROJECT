/**
 * Contract API Controller — Internal REST API for inter-service communication
 */
const pool = require("../config/db");
const Contract = require("../models/contract.model");

// GET /api/contracts?ids=1,2,3
exports.findByIds = (req, res) => {
    const idsParam = req.query.ids || "";
    const ids = idsParam.split(",").map(Number).filter(id => id > 0);
    if (!ids.length) return res.json([]);

    pool.query("SELECT * FROM contracts WHERE id IN (?)", [ids], (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving contracts" });
        res.json(data);
    });
};

// GET /api/contracts/:id
exports.findOne = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid contract ID" });

    pool.query("SELECT * FROM contracts WHERE id = ?", [id], (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving contract" });
        if (!data.length) return res.status(404).json({ error: "Contract not found" });
        res.json(data[0]);
    });
};

// GET /api/contracts/count
exports.count = (req, res) => {
    pool.query("SELECT COUNT(*) as count FROM contracts", (err, data) => {
        if (err) return res.status(500).json({ error: "Error counting contracts" });
        res.json({ count: data[0].count });
    });
};

// POST /api/supplier/contracts — Create contract from accepted quote
exports.createContract = (req, res) => {
    const { shop_id, supplier_id, product_id, quantity, unit_price } = req.body;
    if (!shop_id || !supplier_id || !product_id || !quantity || !unit_price) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    Contract.create({ shop_id, supplier_id, product_id, quantity, unit_price }, (err, data) => {
        if (err) return res.status(500).json({ error: "Error creating contract" });
        res.status(201).json(data);
    });
};

// GET /api/supplier/contracts/by-shop?shop_id=X
exports.findByShopId = (req, res) => {
    const shopId = parseInt(req.query.shop_id);
    if (!shopId || isNaN(shopId)) return res.json([]);

    Contract.findByShopId(shopId, (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving contracts" });
        res.json(data);
    });
};
