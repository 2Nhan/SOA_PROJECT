const mysql = require("mysql2");
const dbConfig = require("../config/config");

const connection = mysql.createConnection({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  port: dbConfig.PORT
});

const Product = {};

Product.getAll = (result) => {
  connection.query("SELECT p.*, u.full_name as supplier_name FROM products p JOIN users u ON p.supplier_id = u.id ORDER BY p.created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

Product.findById = (id, result) => {
  connection.query("SELECT * FROM products WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.length) { result(null, res[0]); return; }
    result({ kind: "not_found" }, null);
  });
};

Product.create = (newProduct, result) => {
  connection.query("INSERT INTO products (supplier_id, name, description, price, stock, status, category) VALUES (?, ?, ?, ?, ?, 'active', ?)",
    [newProduct.supplier_id, newProduct.name, newProduct.description, newProduct.price, newProduct.stock, newProduct.category],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, { id: res.insertId, ...newProduct });
    }
  );
};

Product.updateById = (id, product, result) => {
  connection.query("UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category = ? WHERE id = ?",
    [product.name, product.description, product.price, product.stock, product.category, id],
    (err, res) => {
      if (err) { result(err, null); return; }
      if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
      result(null, { id: id, ...product });
    }
  );
};

Product.remove = (id, result) => {
  connection.query("DELETE FROM products WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
    result(null, res);
  });
};

module.exports = Product;
