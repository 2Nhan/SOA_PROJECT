const pool = require("../config/db");

const RFQ = {};

// Shop creates RFQ
RFQ.create = (data, result) => {
  pool.query(
    "INSERT INTO rfqs (shop_id, supplier_id, product_id, quantity, note) VALUES (?, ?, ?, ?, ?)",
    [data.shop_id, data.supplier_id, data.product_id, data.quantity, data.note || ""],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, { id: res.insertId, status: "pending" });
    }
  );
};

// Shop views their RFQs — no cross-DB JOINs
RFQ.findByShopId = (shopId, result) => {
  pool.query(
    "SELECT * FROM rfqs WHERE shop_id = ? ORDER BY created_at DESC",
    [shopId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

RFQ.findById = (id, result) => {
  pool.query("SELECT * FROM rfqs WHERE id = ?", [id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.length) { result(null, res[0]); return; }
    result({ kind: "not_found" }, null);
  });
};

// Batch find by IDs (for internal API)
RFQ.findByIds = (ids, result) => {
  pool.query("SELECT * FROM rfqs WHERE id IN (?)", [ids], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

// Find by supplier ID (for internal API)
RFQ.findBySupplierId = (supplierId, result) => {
  pool.query("SELECT * FROM rfqs WHERE supplier_id = ? ORDER BY created_at DESC", [supplierId], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

// Get all RFQs (for admin)
RFQ.getAll = (result) => {
  pool.query("SELECT * FROM rfqs ORDER BY created_at DESC", (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res);
  });
};

// Update RFQ status
RFQ.updateStatus = (id, status, result) => {
  pool.query("UPDATE rfqs SET status = ? WHERE id = ?", [status, id], (err, res) => {
    if (err) { result(err, null); return; }
    if (res.affectedRows == 0) { result({ kind: "not_found" }, null); return; }
    result(null, { id, status });
  });
};

// Shop accepts a quote -> update rfq status (contract creation via Supplier API)
RFQ.acceptQuote = (rfqId, result) => {
  pool.query("UPDATE rfqs SET status = 'accepted' WHERE id = ?", [rfqId], (err) => {
    if (err) { result(err, null); return; }
    result(null, { id: rfqId, status: "accepted" });
  });
};

// Shop rejects a quote
RFQ.rejectQuote = (rfqId, result) => {
  pool.query("UPDATE rfqs SET status = 'rejected' WHERE id = ?", [rfqId], (err) => {
    if (err) { result(err, null); return; }
    result(null, { id: rfqId, status: "rejected" });
  });
};

module.exports = RFQ;
