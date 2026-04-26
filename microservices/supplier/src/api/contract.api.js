/**
 * Contract API Controller — Internal REST API for inter-service communication
 */
const pool = require("../config/db");

// GET /api/supplier/contracts?ids=1,2,3
exports.findByIds = (req, res) => {
    const idsParam = req.query.ids || "";
    const ids = idsParam.split(",").map(Number).filter(id => id > 0);
    if (!ids.length) return res.json([]);

    pool.query("SELECT * FROM contracts WHERE id IN (?)", [ids], (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving contracts" });
        res.json(data);
    });
};

// GET /api/supplier/contracts/by-shop?shop_id=X
exports.findByShopId = (req, res) => {
    const shopId = parseInt(req.query.shop_id);
    if (isNaN(shopId) || shopId < 1) return res.status(400).json({ error: "Invalid shop_id" });

    pool.query("SELECT * FROM contracts WHERE shop_id = ? ORDER BY created_at DESC", [shopId], (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving contracts" });
        res.json(data);
    });
};

// GET /api/supplier/contracts/:id
exports.findOne = (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: "Invalid contract ID" });

    pool.query("SELECT * FROM contracts WHERE id = ?", [id], (err, data) => {
        if (err) return res.status(500).json({ error: "Error retrieving contract" });
        if (!data.length) return res.status(404).json({ error: "Contract not found" });
        res.json(data[0]);
    });
};

// GET /api/supplier/contracts/count
exports.count = (req, res) => {
    pool.query("SELECT COUNT(*) as count FROM contracts", (err, data) => {
        if (err) return res.status(500).json({ error: "Error counting contracts" });
        res.json({ count: data[0].count });
    });
};

// POST /api/supplier/contracts — create a new contract
exports.create = (req, res) => {
    const { quote_id, shop_id, supplier_id, product_id, quantity, unit_price, total_amount, delivery_days } = req.body;

    if (!quote_id || !shop_id || !supplier_id || !product_id || !quantity || !unit_price) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const contractData = {
        quote_id: parseInt(quote_id),
        shop_id: parseInt(shop_id),
        supplier_id: parseInt(supplier_id),
        product_id: parseInt(product_id),
        quantity: parseInt(quantity),
        unit_price: parseFloat(unit_price),
        total_amount: total_amount ? parseFloat(total_amount) : parseFloat(unit_price) * parseInt(quantity),
        delivery_days: delivery_days ? parseInt(delivery_days) : 7,
        status: "draft"
    };

    const numericValues = [
        contractData.quote_id,
        contractData.shop_id,
        contractData.supplier_id,
        contractData.product_id,
        contractData.quantity,
        contractData.unit_price,
        contractData.total_amount,
        contractData.delivery_days
    ];
    if (numericValues.some(v => !Number.isFinite(v) || v <= 0)) {
        return res.status(400).json({ error: "Invalid contract data" });
    }

    pool.getConnection((err, conn) => {
        if (err) return res.status(500).json({ error: "Error creating contract" });

        conn.beginTransaction((err) => {
            if (err) {
                conn.release();
                return res.status(500).json({ error: "Error creating contract" });
            }

            conn.query("SELECT id, supplier_id, status FROM quotes WHERE id = ? FOR UPDATE", [contractData.quote_id], (err, quoteRows) => {
                if (err) return rollback(conn, res, "Error creating contract");
                if (!quoteRows.length) return rollback(conn, res, "Quote not found", 404);
                if (quoteRows[0].supplier_id !== contractData.supplier_id) {
                    return rollback(conn, res, "Quote does not belong to supplier", 400);
                }
                if (quoteRows[0].status !== "pending") {
                    return rollback(conn, res, "Quote is already finalized", 409);
                }

                conn.query("SELECT id FROM contracts WHERE quote_id = ? LIMIT 1", [contractData.quote_id], (err, existingRows) => {
                    if (err) return rollback(conn, res, "Error creating contract");
                    if (existingRows.length) return rollback(conn, res, "Contract already exists for this quote", 409);

                    conn.query(
                        "INSERT INTO contracts (quote_id, shop_id, supplier_id, product_id, quantity, unit_price, total_amount, delivery_days, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [contractData.quote_id, contractData.shop_id, contractData.supplier_id, contractData.product_id, contractData.quantity, contractData.unit_price, contractData.total_amount, contractData.delivery_days, contractData.status],
                        (err, data) => {
                            if (err) return rollback(conn, res, "Error creating contract");

                            conn.query("UPDATE quotes SET status = 'accepted' WHERE id = ?", [contractData.quote_id], (err) => {
                                if (err) return rollback(conn, res, "Error creating contract");

                                conn.commit((err) => {
                                    if (err) return rollback(conn, res, "Error creating contract");
                                    conn.release();
                                    res.status(201).json({ id: data.insertId, ...contractData });
                                });
                            });
                        }
                    );
                });
            });
        });
    });
};

function rollback(conn, res, message, status = 500) {
    conn.rollback(() => {
        conn.release();
        res.status(status).json({ error: message });
    });
}
