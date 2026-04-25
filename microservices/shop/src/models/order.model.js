const pool = require("../config/db");

const Order = {};

// Create order — stock management via Supplier API in controller
Order.create = (newOrder, result) => {
  pool.query(
    "INSERT INTO orders (shop_id, product_id, quantity, total_price, status, note, contract_id) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [newOrder.shop_id, newOrder.product_id, newOrder.quantity, newOrder.total_price, newOrder.note || "", newOrder.contract_id || null],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, { id: res.insertId, total_price: newOrder.total_price, status: "pending" });
    }
  );
};

// No cross-DB JOINs — enrichment in controller
Order.findByShopId = (shopId, result) => {
  pool.query(
    "SELECT * FROM orders WHERE shop_id = ? ORDER BY created_at DESC",
    [shopId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Order.findById = (id, result) => {
  pool.query("SELECT * FROM orders WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.length) { result(null, res[0]); return; }
    result({ kind: "not_found" }, null);
  });
};

// Batch find by IDs (for internal API)
Order.findByIds = (ids, result) => {
  pool.query("SELECT * FROM orders WHERE id IN (?)", [ids], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

// Get all orders (for internal API — supplier admin)
Order.getAll = (result) => {
  pool.query("SELECT * FROM orders ORDER BY created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

// Update order status (for internal API — supplier confirm/cancel/pay)
Order.updateStatus = (id, status, result) => {
  pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
    result(null, { id, status });
  });
};

module.exports = Order;
