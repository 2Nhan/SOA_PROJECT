const pool = require("../config/db");

const Contract = {};

Contract.findBySupplierId = (supplierId, result) => {
  pool.query(
    `SELECT c.*, p.name as product_name, p.image_url, s.full_name as shop_name
     FROM contracts c
     JOIN products p ON c.product_id = p.id
     JOIN users s ON c.shop_id = s.id
     WHERE c.supplier_id = ?
     ORDER BY c.created_at DESC`,
    [supplierId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Contract.findById = (id, result) => {
  pool.query(
    `SELECT c.*, p.name as product_name, p.image_url, p.description as product_desc,
     s.full_name as shop_name, u.full_name as supplier_name
     FROM contracts c
     JOIN products p ON c.product_id = p.id
     JOIN users s ON c.shop_id = s.id
     JOIN users u ON c.supplier_id = u.id
     WHERE c.id = ?`,
    [id],
    (err, res) => {
      if (err) { result(err, null); return; }
      if (res.length) { result(null, res[0]); return; }
      result({ kind: "not_found" }, null);
    }
  );
};

Contract.confirm = (id, result) => {
  pool.query("UPDATE contracts SET status = 'confirmed' WHERE id = ? AND status = 'draft'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_invalid" }, null); return; }
    result(null, { id, status: "confirmed" });
  });
};

Contract.cancel = (id, result) => {
  pool.query("UPDATE contracts SET status = 'cancelled' WHERE id = ? AND status IN ('draft','confirmed')", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_invalid" }, null); return; }
    result(null, { id, status: "cancelled" });
  });
};

// Get all contracts (for admin)
Contract.getAll = (result) => {
  pool.query(
    `SELECT c.*, p.name as product_name, s.full_name as shop_name, u.full_name as supplier_name
     FROM contracts c
     JOIN products p ON c.product_id = p.id
     JOIN users s ON c.shop_id = s.id
     JOIN users u ON c.supplier_id = u.id
     ORDER BY c.created_at DESC`,
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

module.exports = Contract;
