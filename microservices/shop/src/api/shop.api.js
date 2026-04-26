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
exports.updateRfqStatus = (req, res) => {
    const id = parseInt(req.params.id);
    const status = req.body.status;
    const allowed = ["pending", "quoted", "accepted", "rejected", "expired"];
    if (isNaN(id) || !allowed.includes(status)) return res.status(400).json({ error: "Invalid ID or status" });

    RFQ.findById(id, (err, rfq) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "RFQ not found" });
            return res.status(500).json({ error: "Error retrieving RFQ" });
        }
        if (!isAllowedTransition(RFQ_TRANSITIONS, rfq.status, status)) {
            return res.status(409).json({ error: `Invalid RFQ status transition: ${rfq.status} -> ${status}` });
        }

        RFQ.updateStatus(id, status, (err, data) => {
            if (err) return res.status(500).json({ error: "Error updating RFQ status" });
            res.json(data);
        });
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
exports.updateOrderStatus = (req, res) => {
    const id = parseInt(req.params.id);
    const status = req.body.status;
    const allowed = ["pending", "confirmed", "paid", "delivering", "delivered", "cancelled"];
    if (isNaN(id) || !allowed.includes(status)) return res.status(400).json({ error: "Invalid ID or status" });

    Order.findById(id, (err, order) => {
        if (err) {
            if (err.kind === "not_found") return res.status(404).json({ error: "Order not found" });
            return res.status(500).json({ error: "Error retrieving order" });
        }
        if (!isAllowedTransition(ORDER_TRANSITIONS, order.status, status)) {
            return res.status(409).json({ error: `Invalid order status transition: ${order.status} -> ${status}` });
        }

        Order.updateStatus(id, status, (err, data) => {
            if (err) return res.status(500).json({ error: "Error updating order status" });
            res.json(data);
        });
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

const RFQ_TRANSITIONS = {
    pending: ["quoted", "rejected", "expired"],
    quoted: ["accepted", "rejected", "expired"],
    accepted: [],
    rejected: [],
    expired: []
};

const ORDER_TRANSITIONS = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["paid", "cancelled"],
    paid: ["delivering", "delivered"],
    delivering: ["delivered"],
    delivered: [],
    cancelled: []
};

function isAllowedTransition(transitions, current, next) {
    return current === next || (transitions[current] || []).includes(next);
}
