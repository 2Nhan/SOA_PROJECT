const pool = require("../config/db");

const Payment = {};

// Process payment for an order (Saga step - payment)
// Orders are in shop_db — order status update via Shop API in controller
Payment.process = (orderId, amount, method, result) => {
  pool.query(
    "INSERT INTO payments (order_id, amount, method, status) VALUES (?, ?, ?, 'pending')",
    [orderId, amount, method || "bank_transfer"],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, { id: res.insertId, order_id: orderId, amount, status: "pending" });
    }
  );
};

Payment.updateStatus = (id, status, result) => {
  pool.query("UPDATE payments SET status = ? WHERE id = ?", [status, id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows === 0) { result({ kind: "not_found" }, null); return; }
    result(null, { id, status });
  });
};

Payment.findByOrderId = (orderId, result) => {
  pool.query("SELECT * FROM payments WHERE order_id = ?", [orderId], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

module.exports = Payment;
