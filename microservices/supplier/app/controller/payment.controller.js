const Payment = require("../models/payment.model");

exports.processForm = (req, res) => {
  res.render("payment-process", { order_id: req.params.id });
};

exports.process = (req, res) => {
  const orderId = req.params.id;
  const method = req.body.method || "bank_transfer";

  Payment.process(orderId, method, (err, data) => {
    if (err) {
      if (err.kind === "order_not_confirmed") {
        res.render("error", { message: "Order must be confirmed before payment" }); return;
      }
      if (err.kind === "payment_failed") {
        res.render("error", { message: "Payment failed. Order cancelled and stock restored. Reason: " + err.message }); return;
      }
      res.status(500).render("error", { message: "Error processing payment" }); return;
    }
    res.redirect("/admin/orders/" + orderId);
  });
};
