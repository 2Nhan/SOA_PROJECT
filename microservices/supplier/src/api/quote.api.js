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
