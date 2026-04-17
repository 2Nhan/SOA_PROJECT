const pool = require("../config/db");

const Admin = {};

// ---- USER MANAGEMENT ----

Admin.getAllUsers = (result) => {
  pool.query("SELECT id, email, full_name, role, status, created_at FROM users ORDER BY created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

Admin.approveUser = (id, result) => {
  pool.query("UPDATE users SET status = 'approved' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_already" }, null); return; }
    result(null, { id, status: "approved" });
  });
};

Admin.rejectUser = (id, result) => {
  pool.query("UPDATE users SET status = 'rejected' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_already" }, null); return; }
    result(null, { id, status: "rejected" });
  });
};

Admin.deleteUser = (id, result) => {
  pool.query("DELETE FROM users WHERE id = ? AND role != 'admin'", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found_or_admin" }, null); return; }
    result(null, { id, deleted: true });
  });
};

// ---- PRODUCT APPROVAL ----

Admin.getPendingProducts = (result) => {
  pool.query(
    `SELECT p.*, u.full_name as supplier_name
     FROM products p JOIN users u ON p.supplier_id = u.id
     WHERE p.status = 'pending'
     ORDER BY p.created_at DESC`,
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

// ---- RFQ OVERVIEW ----

Admin.getAllRFQs = (result) => {
  pool.query(
    `SELECT r.*, p.name as product_name, s.full_name as shop_name, u.full_name as supplier_name
     FROM rfqs r
     JOIN products p ON r.product_id = p.id
     JOIN users s ON r.shop_id = s.id
     JOIN users u ON r.supplier_id = u.id
     ORDER BY r.created_at DESC`,
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

// ---- DASHBOARD STATS ----

Admin.getStats = (result) => {
  const stats = {};
  pool.query("SELECT COUNT(*) as count FROM users", (err, res) => {
    if (err) { result(err, null); return; }
    stats.totalUsers = res[0].count;
    pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'pending'", (err, res) => {
      if (err) { result(err, null); return; }
      stats.pendingUsers = res[0].count;
      pool.query("SELECT COUNT(*) as count FROM products", (err, res) => {
        if (err) { result(err, null); return; }
        stats.totalProducts = res[0].count;
        pool.query("SELECT COUNT(*) as count FROM products WHERE status = 'pending'", (err, res) => {
          if (err) { result(err, null); return; }
          stats.pendingProducts = res[0].count;
          pool.query("SELECT COUNT(*) as count FROM orders", (err, res) => {
            if (err) { result(err, null); return; }
            stats.totalOrders = res[0].count;
            pool.query("SELECT COUNT(*) as count FROM rfqs", (err, res) => {
              if (err) { result(err, null); return; }
              stats.totalRFQs = res[0].count;
              pool.query("SELECT COUNT(*) as count FROM contracts", (err, res) => {
                if (err) { result(err, null); return; }
                stats.totalContracts = res[0].count;
                result(null, stats);
              });
            });
          });
        });
      });
    });
  });
};

module.exports = Admin;
