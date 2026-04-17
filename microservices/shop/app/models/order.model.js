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

// Create order + reduce stock (Saga step 1)
Order.create = (newOrder, result) => {
  // First check stock
  connection.query("SELECT stock, price FROM products WHERE id = ? AND status = 'active'", [newOrder.product_id], (err, res) => {
    if (err) { result(err, null); return; }
    if (!res.length) { result({ kind: "product_not_found" }, null); return; }

    const product = res[0];
    if (product.stock < newOrder.quantity) {
      result({ kind: "insufficient_stock", available: product.stock }, null);
      return;
    }

    const totalPrice = product.price * newOrder.quantity;

    // Begin transaction
    connection.beginTransaction((err) => {
      if (err) { result(err, null); return; }

      // Insert order
      connection.query(
        "INSERT INTO orders (shop_id, product_id, quantity, total_price, status, note) VALUES (?, ?, ?, ?, 'pending', ?)",
        [newOrder.shop_id, newOrder.product_id, newOrder.quantity, totalPrice, newOrder.note || ""],
        (err, res) => {
          if (err) { connection.rollback(); result(err, null); return; }

          const orderId = res.insertId;

          // Reduce stock
          connection.query(
            "UPDATE products SET stock = stock - ? WHERE id = ?",
            [newOrder.quantity, newOrder.product_id],
            (err) => {
              if (err) { connection.rollback(); result(err, null); return; }

              connection.commit((err) => {
                if (err) { connection.rollback(); result(err, null); return; }
                result(null, { id: orderId, total_price: totalPrice, status: "pending" });
              });
            }
          );
        }
      );
    });
  });
};

Order.findByShopId = (shopId, result) => {
  connection.query(
    "SELECT o.*, p.name as product_name, p.image_url FROM orders o JOIN products p ON o.product_id = p.id WHERE o.shop_id = ? ORDER BY o.created_at DESC",
    [shopId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Order.findById = (id, result) => {
  connection.query(
    "SELECT o.*, p.name as product_name, p.price as unit_price, p.image_url, u.full_name as supplier_name FROM orders o JOIN products p ON o.product_id = p.id JOIN users u ON p.supplier_id = u.id WHERE o.id = ?",
    [id],
    (err, res) => {
      if (err) { result(err, null); return; }
      if (res.length) { result(null, res[0]); return; }
      result({ kind: "not_found" }, null);
    }
  );
};

module.exports = Order;
