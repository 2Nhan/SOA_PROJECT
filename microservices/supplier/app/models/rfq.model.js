const pool = require("../config/db");

const RFQ = {};

// Supplier views RFQs sent to them
RFQ.findBySupplierId = (supplierId, result) => {
  pool.query(
    `SELECT r.*, p.name as product_name, p.image_url, s.full_name as shop_name
     FROM rfqs r
     JOIN products p ON r.product_id = p.id
     JOIN users s ON r.shop_id = s.id
     WHERE r.supplier_id = ?
     ORDER BY r.created_at DESC`,
    [supplierId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

RFQ.findById = (id, result) => {
  pool.query(
    `SELECT r.*, p.name as product_name, p.price as list_price, p.image_url,
     s.full_name as shop_name, u.full_name as supplier_name,
     q.id as quote_id, q.unit_price, q.moq, q.delivery_days, q.note as quote_note, q.status as quote_status
     FROM rfqs r
     JOIN products p ON r.product_id = p.id
     JOIN users s ON r.shop_id = s.id
     JOIN users u ON r.supplier_id = u.id
     LEFT JOIN quotes q ON q.rfq_id = r.id
     WHERE r.id = ?`,
    [id],
    (err, res) => {
      if (err) { result(err, null); return; }
      if (res.length) { result(null, res[0]); return; }
      result({ kind: "not_found" }, null);
    }
  );
};

// Supplier submits quote for an RFQ
RFQ.submitQuote = (rfqId, data, result) => {
  pool.getConnection((err, connection) => {
    if (err) { result(err, null); return; }
    connection.beginTransaction((err) => {
      if (err) { connection.release(); result(err, null); return; }

      connection.query(
        "INSERT INTO quotes (rfq_id, supplier_id, unit_price, moq, delivery_days, note) VALUES (?, ?, ?, ?, ?, ?)",
        [rfqId, data.supplier_id, data.unit_price, data.moq || 1, data.delivery_days || 7, data.note || ""],
        (err, res) => {
          if (err) { connection.rollback(() => connection.release()); result(err, null); return; }

          connection.query("UPDATE rfqs SET status = 'quoted' WHERE id = ?", [rfqId], (err) => {
            if (err) { connection.rollback(() => connection.release()); result(err, null); return; }

            connection.commit((err) => {
              if (err) { connection.rollback(() => connection.release()); result(err, null); return; }
              connection.release();
              result(null, { id: res.insertId, rfq_id: rfqId });
            });
          });
        }
      );
    });
  });
};

module.exports = RFQ;
