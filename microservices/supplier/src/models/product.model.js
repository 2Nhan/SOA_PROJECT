const pool = require("../config/db");

const Product = {};

// Removed JOIN users — supplier_name resolved via Auth API in controller
Product.getAll = (result) => {
  pool.query("SELECT * FROM products ORDER BY created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

// Active products only (for Shop API)
Product.getAllActive = (result) => {
  pool.query("SELECT * FROM products WHERE status = 'active' ORDER BY created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

Product.findById = (id, result) => {
  pool.query("SELECT * FROM products WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.length) { result(null, res[0]); return; }
    result({ kind: "not_found" }, null);
  });
};

// Batch query by IDs (for inter-service API)
Product.findByIds = (ids, result) => {
  pool.query("SELECT * FROM products WHERE id IN (?)", [ids], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

Product.search = (keyword, result) => {
  const q = `%${keyword}%`;
  pool.query(
    "SELECT * FROM products WHERE status = 'active' AND (name LIKE ? OR category LIKE ? OR description LIKE ?) ORDER BY created_at DESC",
    [q, q, q],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Product.create = (newProduct, result) => {
  pool.query("INSERT INTO products (supplier_id, name, description, price, stock, status, category, image_url) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    [newProduct.supplier_id, newProduct.name, newProduct.description, newProduct.price, newProduct.stock, newProduct.category, newProduct.image_url || null],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, { id: res.insertId, ...newProduct });
    }
  );
};

Product.updateById = (id, product, result) => {
  pool.query("UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category = ?, image_url = ? WHERE id = ?",
    [product.name, product.description, product.price, product.stock, product.category, product.image_url || null, id],
    (err, res) => {
      if (err) { result(err, null); return; }
      if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
      result(null, { id: id, ...product });
    }
  );
};

Product.remove = (id, result) => {
  pool.query("DELETE FROM products WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
    result(null, res);
  });
};

// Saga: check stock and reduce atomically
Product.checkAndReduceStock = (id, quantity, result) => {
  pool.query("SELECT stock, price FROM products WHERE id = ? AND status = 'active'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (!res.length) { result({ kind: "product_not_found" }, null); return; }

    const product = res[0];
    if (product.stock < quantity) {
      result({ kind: "insufficient_stock", available: product.stock }, null);
      return;
    }

    pool.query("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?", [quantity, id, quantity], (err, uRes) => {
      if (err) { result(err, null); return; }
      if (uRes.affectedRows == 0) { result({ kind: "insufficient_stock", available: 0 }, null); return; }
      result(null, { success: true, price: product.price, reduced: quantity });
    });
  });
};

// Saga compensating: restore stock
Product.restoreStock = (id, quantity, result) => {
  pool.query("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, id], (err) => {
    if (err) { result(err, null); return; }
    result(null, { success: true, restored: quantity });
  });
};

module.exports = Product;
