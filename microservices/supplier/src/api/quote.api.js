/**
 * Quote API Controller — Internal REST API for inter-service communication
 * Exposes quote data for Shop service
 */
const pool = require("../config/db");

// GET /api/quotes?rfq_ids=1,2,3
exports.findByRfqIds = (req, res) => {
    const idsParam = req.query.rfq_ids || "";
    const ids = idsParam.split(",").map(Number).filter(id => id > 0);
    if (!ids.length) return res.json([]);

    pool.query(
        "SELECT * FROM quotes WHERE rfq_id IN (?)",
        [ids],
        (err, data) => {
            if (err) return res.status(500).json({ error: "Error retrieving quotes" });
            res.json(data);
        }
    );
};

// GET /api/quotes/:id
exports.findOne = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid quote ID" });

    pool.query("SELECT * FROM quotes WHERE id = ?", [id], (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving quote" });
        if (!data.length) return res.status(404).json({ error: "Quote not found" });
        res.json(data[0]);
    });
};

// POST /api/supplier/quotes/:id/status
exports.updateStatus = (req, res) => {
    const id = parseInt(req.params.id);
    const status = req.body.status;

    if (isNaN(id) || id < 1 || status !== "rejected") {
        return res.status(400).json({ error: "Invalid quote ID or status" });
    }

    pool.query("SELECT status FROM quotes WHERE id = ?", [id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Error retrieving quote" });
        if (!rows.length) return res.status(404).json({ error: "Quote not found" });
        if (rows[0].status !== "pending") {
            return res.status(409).json({ error: `Invalid quote status transition: ${rows[0].status} -> ${status}` });
        }

        pool.query("UPDATE quotes SET status = ? WHERE id = ? AND status = 'pending'", [status, id], (err, data) => {
            if (err) return res.status(500).json({ error: "Error updating quote status" });
            if (data.affectedRows === 0) return res.status(409).json({ error: "Quote status changed before update" });
            res.json({ id, status });
        });
    });
};
