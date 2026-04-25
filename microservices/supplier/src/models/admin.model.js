const pool = require("../config/db");

const Admin = {};

// ---- PRODUCT MANAGEMENT (local to supplier_db) ----

Admin.getPendingProducts = (result) => {
  pool.query(
    "SELECT * FROM products WHERE status = 'pending' ORDER BY created_at DESC",
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

Admin.approveProduct = (id, result) => {
  pool.query("UPDATE products SET status = 'active' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_already" }, null); return; }
    result(null, { id, status: "active" });
  });
};

Admin.rejectProduct = (id, result) => {
  pool.query("UPDATE products SET status = 'inactive' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_already" }, null); return; }
    result(null, { id, status: "inactive" });
  });
};

Admin.deleteProduct = (id, result) => {
  pool.query("DELETE FROM products WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
    result(null, { id, deleted: true });
  });
};

// ---- LOCAL STATS (supplier_db tables only) ----

Admin.getLocalStats = (result) => {
  const stats = {};
  pool.query("SELECT COUNT(*) as count FROM products", (err, res) => {
    if (err) { result(err, null); return; }
    stats.totalProducts = res[0].count;
    pool.query("SELECT COUNT(*) as count FROM products WHERE status = 'pending'", (err, res) => {
      if (err) { result(err, null); return; }
      stats.pendingProducts = res[0].count;
      pool.query("SELECT COUNT(*) as count FROM contracts", (err, res) => {
        if (err) { result(err, null); return; }
        stats.totalContracts = res[0].count;
        result(null, stats);
      });
    });
  });
};

module.exports = Admin;
