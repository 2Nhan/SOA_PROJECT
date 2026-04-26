/**
 * Shop Internal API Controllers — for inter-service communication
 * Exposes RFQ and Order data for Supplier service
 */
const RFQ = require("../models/rfq.model");
const Order = require("../models/order.model");

// ============ RFQ API ============

// GET /api/rfqs?supplier_id=X or ?ids=1,2,3
exports.findRfqs = (req, res) => {
    const supplierId = parseInt(req.query.supplier_id);
    if (supplierId) {
        return RFQ.findBySupplierId(supplierId, (err, data) => {
            if (err) return res.status(500).json({ error: "Error retrieving RFQs" });
            res.json(data);
        });
    }

    const idsParam = req.query.ids || "";
    const ids = idsParam.split(",").map(Number).filter(id => id > 0);
    if (ids.length) {
        return RFQ.findByIds(ids, (err, data) => {
            if (err) return res.status(500).json({ error: "Error retrieving RFQs" });
            res.json(data);
        });
    }

    res.json([]);
};

// GET /api/rfqs/all
exports.findAllRfqs = (req, res) => {
    RFQ.getAll((err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving RFQs" });
        res.json(data);
    });
};

// GET /api/rfqs/:id
exports.findOneRfq = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid RFQ ID" });

    RFQ.findById(id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "RFQ not found" });
            return res.status(500).json({ error: "Error retrieving RFQ" });
        }
        res.json(data);
    });
};

// POST /api/rfqs/:id/status
const VALID_RFQ_STATUSES = ["pending", "quoted", "accepted", "rejected", "cancelled"];
exports.updateRfqStatus = (req, res) => {
    const id = parseInt(req.params.id);
    const status = req.body.status;
    if (isNaN(id) || !status) return res.status(400).json({ error: "Invalid ID or status" });
    if (!VALID_RFQ_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_RFQ_STATUSES.join(", ")}` });
    }

    RFQ.updateStatus(id, status, (err, data) => {
        if (err) return res.status(500).json({ error: "Error updating RFQ status" });
        res.json(data);
    });
};

// ============ ORDER API ============

// GET /api/orders/all
exports.findAllOrders = (req, res) => {
    Order.getAll((err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving orders" });
        res.json(data);
    });
};

// GET /api/orders/:id
exports.findOneOrder = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid order ID" });

    Order.findById(id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "Order not found" });
            return res.status(500).json({ error: "Error retrieving order" });
        }
        res.json(data);
    });
};

// POST /api/orders/:id/status
const VALID_ORDER_STATUSES = ["pending", "confirmed", "cancelled", "paid", "shipped", "delivered"];
exports.updateOrderStatus = (req, res) => {
    const id = parseInt(req.params.id);
    const status = req.body.status;
    if (isNaN(id) || !status) return res.status(400).json({ error: "Invalid ID or status" });
    if (!VALID_ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_ORDER_STATUSES.join(", ")}` });
    }

    Order.updateStatus(id, status, (err, data) => {
        if (err) return res.status(500).json({ error: "Error updating order status" });
        res.json(data);
    });
};

// GET /api/stats — counts for admin dashboard
exports.stats = (req, res) => {
    Order.getAll((err, orders) => {
        if (err) return res.status(500).json({ error: "Error getting stats" });
        RFQ.getAll((err, rfqs) => {
            if (err) return res.status(500).json({ error: "Error getting stats" });
            res.json({
                totalOrders: orders.length,
                totalRFQs: rfqs.length
            });
        });
    });
};
