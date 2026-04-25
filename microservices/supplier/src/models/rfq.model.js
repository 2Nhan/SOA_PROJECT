const pool = require("../config/db");

const RFQ = {};

// Supplier views RFQs sent to them — now fetches from Shop API via controller
// This model only handles quotes (local to supplier_db)

// Submit quote for an RFQ (rfq status update via Shop API in controller)
RFQ.submitQuote = (rfqId, data, result) => {
  pool.query(
    "INSERT INTO quotes (rfq_id, supplier_id, unit_price, moq, delivery_days, note) VALUES (?, ?, ?, ?, ?, ?)",
    [rfqId, data.supplier_id, data.unit_price, data.moq || 1, data.delivery_days || 7, data.note || ""],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, { id: res.insertId, rfq_id: rfqId });
    }
  );
};

// Get quote by RFQ ID
RFQ.getQuoteByRfqId = (rfqId, result) => {
  pool.query("SELECT * FROM quotes WHERE rfq_id = ? ORDER BY created_at DESC LIMIT 1", [rfqId], (err, res) => {
    if (err) { result(err, null); return; }
    result(null, res.length ? res[0] : null);
  });
};

module.exports = RFQ;
