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

// Shop views their RFQs
RFQ.findByShopId = (shopId, result) => {
  pool.query(
    `SELECT r.*, p.name as product_name, p.image_url, u.full_name as supplier_name,
     q.unit_price as quoted_price, q.moq, q.delivery_days, q.id as quote_id, q.status as quote_status
     FROM rfqs r
     JOIN products p ON r.product_id = p.id
     JOIN users u ON r.supplier_id = u.id
     LEFT JOIN quotes q ON q.rfq_id = r.id
     WHERE r.shop_id = ?
     ORDER BY r.created_at DESC`,
    [shopId],
    (err, res) => {
      if (err) { result(err, null); return; }
      result(null, res);
    }
  );
};

RFQ.findById = (id, result) => {
  pool.query(
    `SELECT r.*, p.name as product_name, p.price as list_price, p.image_url, p.description as product_desc,
     u.full_name as supplier_name, s.full_name as shop_name,
     q.id as quote_id, q.unit_price as quoted_price, q.moq, q.delivery_days, q.note as quote_note, q.status as quote_status
     FROM rfqs r
     JOIN products p ON r.product_id = p.id
     JOIN users u ON r.supplier_id = u.id
     JOIN users s ON r.shop_id = s.id
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

// Shop accepts a quote -> creates contract
RFQ.acceptQuote = (rfqId, quoteId, result) => {
  pool.getConnection((err, connection) => {
    if (err) { result(err, null); return; }
    connection.beginTransaction((err) => {
      if (err) { connection.release(); result(err, null); return; }

      // Get quote + rfq details
      connection.query(
        `SELECT q.*, r.shop_id, r.product_id, r.quantity
         FROM quotes q JOIN rfqs r ON q.rfq_id = r.id
         WHERE q.id = ? AND q.rfq_id = ?`,
        [quoteId, rfqId],
        (err, res) => {
          if (err) { connection.rollback(() => connection.release()); result(err, null); return; }
          if (!res.length) { connection.release(); result({ kind: "not_found" }, null); return; }

          const quote = res[0];
          const totalAmount = quote.unit_price * quote.quantity;

          // Update quote status
          connection.query("UPDATE quotes SET status = 'accepted' WHERE id = ?", [quoteId], (err) => {
            if (err) { connection.rollback(() => connection.release()); result(err, null); return; }

            // Update RFQ status
            connection.query("UPDATE rfqs SET status = 'accepted' WHERE id = ?", [rfqId], (err) => {
              if (err) { connection.rollback(() => connection.release()); result(err, null); return; }

              // Create contract
              connection.query(
                `INSERT INTO contracts (quote_id, shop_id, supplier_id, product_id, quantity, unit_price, total_amount, delivery_days)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [quoteId, quote.shop_id, quote.supplier_id, quote.product_id, quote.quantity, quote.unit_price, totalAmount, quote.delivery_days],
                (err, cRes) => {
                  if (err) { connection.rollback(() => connection.release()); result(err, null); return; }

                  connection.commit((err) => {
                    if (err) { connection.rollback(() => connection.release()); result(err, null); return; }
                    connection.release();
                    result(null, { contract_id: cRes.insertId, total_amount: totalAmount });
                  });
                }
              );
            });
          });
        }
      );
    });
  });
};

// Shop rejects a quote
RFQ.rejectQuote = (rfqId, quoteId, result) => {
  pool.getConnection((err, connection) => {
    if (err) { result(err, null); return; }
    connection.beginTransaction((err) => {
      if (err) { connection.release(); result(err, null); return; }
      connection.query("UPDATE quotes SET status = 'rejected' WHERE id = ? AND rfq_id = ?", [quoteId, rfqId], (err) => {
        if (err) { connection.rollback(() => connection.release()); result(err, null); return; }
        connection.query("UPDATE rfqs SET status = 'rejected' WHERE id = ?", [rfqId], (err) => {
          if (err) { connection.rollback(() => connection.release()); result(err, null); return; }
          connection.commit((err) => {
            if (err) { connection.rollback(() => connection.release()); result(err, null); return; }
            connection.release();
            result(null, { id: rfqId, status: "rejected" });
          });
        });
      });
    });
  });
};

module.exports = RFQ;
