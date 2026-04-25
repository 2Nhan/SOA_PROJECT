const pool = require("../config/db");

const Order = {};

// Orders are in shop_db — Supplier accesses via Shop API
// This model handles order-related operations on supplier_db (stock management)

// Rollback stock — compensating transaction for order cancel
Order.restoreStock = (productId, quantity, result) => {
  pool.query("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, productId], (err) => {
    if (err) { result(err, null); return; }
    result(null, { restored: quantity });
  });
};

module.exports = Order;
