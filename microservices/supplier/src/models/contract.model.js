const pool = require("../config/db");

const Contract = {};

// Contracts are in supplier_db — local queries, no cross-DB JOINs
Contract.findBySupplierId = (supplierId, result) => {
  pool.query(
    "SELECT * FROM contracts WHERE supplier_id = ? ORDER BY created_at DESC",
    [supplierId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Contract.findById = (id, result) => {
  pool.query("SELECT * FROM contracts WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.length) { result(null, res[0]); return; }
    result({ kind: "not_found" }, null);
  });
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

// Get all contracts (for admin) — no JOIN, enriched in controller
Contract.getAll = (result) => {
  pool.query("SELECT * FROM contracts ORDER BY created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

module.exports = Contract;
