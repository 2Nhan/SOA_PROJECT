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
  connection.query("SELECT p.*, u.full_name as supplier_name FROM products p JOIN users u ON p.supplier_id = u.id WHERE p.status = 'active' ORDER BY p.created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

Product.findById = (id, result) => {
  connection.query("SELECT p.*, u.full_name as supplier_name FROM products p JOIN users u ON p.supplier_id = u.id WHERE p.id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.length) { result(null, res[0]); return; }
    result({ kind: "not_found" }, null);
  });
};

Product.search = (keyword, result) => {
  const q = `%${keyword}%`;
  connection.query("SELECT p.*, u.full_name as supplier_name FROM products p JOIN users u ON p.supplier_id = u.id WHERE p.status = 'active' AND (p.name LIKE ? OR p.category LIKE ? OR p.description LIKE ?) ORDER BY p.created_at DESC", [q, q, q], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

module.exports = Product;
