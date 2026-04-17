const mysql = require("mysql2");
const dbConfig = require("../config/config");

const connection = mysql.createConnection({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  port: dbConfig.PORT
});

const Order = {};

Order.getAll = (result) => {
  connection.query(
    "SELECT o.*, p.name as product_name, u.full_name as shop_name FROM orders o JOIN products p ON o.product_id = p.id JOIN users u ON o.shop_id = u.id ORDER BY o.created_at DESC",
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Order.findById = (id, result) => {
  connection.query(
    "SELECT o.*, p.name as product_name, p.price as unit_price, u.full_name as shop_name FROM orders o JOIN products p ON o.product_id = p.id JOIN users u ON o.shop_id = u.id WHERE o.id = ?",
    [id],
    (err, res) => {
      if (err) { result(err, null); return; }
      if (res.length) { result(null, res[0]); return; }
      result({ kind: "not_found" }, null);
    }
  );
};

Order.confirm = (id, result) => {
  connection.query("UPDATE orders SET status = 'confirmed' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_invalid_status" }, null); return; }
    result(null, { id: id, status: "confirmed" });
  });
};

// Cancel order + rollback stock (Saga compensating transaction)
Order.cancel = (id, result) => {
  // Get order details first
  connection.query("SELECT * FROM orders WHERE id = ? AND status IN ('pending', 'confirmed')", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (!res.length) { result({ kind: "not_found_or_invalid_status" }, null); return; }

    const order = res[0];

    connection.beginTransaction((err) => {
      if (err) { result(err, null); return; }

      // Cancel order
      connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id], (err) => {
        if (err) { connection.rollback(); result(err, null); return; }

        // Rollback stock - compensating transaction
        connection.query("UPDATE products SET stock = stock + ? WHERE id = ?", [order.quantity, order.product_id], (err) => {
          if (err) { connection.rollback(); result(err, null); return; }

          connection.commit((err) => {
            if (err) { connection.rollback(); result(err, null); return; }
            result(null, { id: id, status: "cancelled", restored_quantity: order.quantity });
          });
        });
      });
    });
  });
};

module.exports = Order;
