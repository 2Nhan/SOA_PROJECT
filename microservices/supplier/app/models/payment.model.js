const mysql = require("mysql2");
const dbConfig = require("../config/config");

const connection = mysql.createConnection({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  port: dbConfig.PORT
});

const Payment = {};

// Process payment for an order (Saga step - payment)
Payment.process = (orderId, method, result) => {
  // Check order exists and is confirmed
  connection.query("SELECT * FROM orders WHERE id = ? AND status = 'confirmed'", [orderId], (err, res) => {
    if (err) { result(err, null); return; }
    if (!res.length) { result({ kind: "order_not_confirmed" }, null); return; }

    const order = res[0];

    connection.beginTransaction((err) => {
      if (err) { result(err, null); return; }

      // Insert payment
      connection.query(
        "INSERT INTO payments (order_id, amount, method, status) VALUES (?, ?, ?, 'success')",
        [orderId, order.total_price, method || "bank_transfer"],
        (err, payRes) => {
          if (err) {
            connection.rollback();
            // Compensating: cancel order + restore stock
            connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [orderId], () => {
              connection.query("UPDATE products SET stock = stock + ? WHERE id = ?", [order.quantity, order.product_id], () => {
                result({ kind: "payment_failed", message: err.message }, null);
              });
            });
            return;
          }

          // Update order status to paid
          connection.query("UPDATE orders SET status = 'paid' WHERE id = ?", [orderId], (err) => {
            if (err) {
              connection.rollback();
              result(err, null);
              return;
            }

            connection.commit((err) => {
              if (err) { connection.rollback(); result(err, null); return; }
              result(null, { id: payRes.insertId, order_id: orderId, amount: order.total_price, status: "success" });
            });
          });
        }
      );
    });
  });
};

Payment.findByOrderId = (orderId, result) => {
  connection.query("SELECT * FROM payments WHERE order_id = ?", [orderId], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

module.exports = Payment;
