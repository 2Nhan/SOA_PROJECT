const RFQ = require("../models/rfq.model");

exports.findAll = (req, res) => {
  const supplierId = parseInt(req.query.supplier_id) || 2;
  RFQ.findBySupplierId(supplierId, (err, data) => {
    if (err) return res.status(500).render("error", { message: "Error retrieving RFQs" });
    res.render("rfq-list", { rfqs: data });
  });
};

exports.findOne = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid RFQ ID" });
  RFQ.findById(id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") return res.status(404).render("error", { message: "RFQ not found" });
      return res.status(500).render("error", { message: "Error retrieving RFQ" });
    }
    res.render("rfq-detail", { rfq: data });
  });
};

exports.submitQuote = (req, res) => {
  const rfqId = parseInt(req.params.id);
  if (isNaN(rfqId) || rfqId < 1) return res.status(400).render("error", { message: "Invalid RFQ ID" });

  const unitPrice = parseFloat(req.body.unit_price);
  const moq = parseInt(req.body.moq) || 1;
  const deliveryDays = parseInt(req.body.delivery_days) || 7;
  const supplierId = parseInt(req.body.supplier_id) || 2;

  if (isNaN(unitPrice) || unitPrice <= 0) return res.status(400).render("error", { message: "Valid unit price is required" });
  if (moq < 1) return res.status(400).render("error", { message: "MOQ must be at least 1" });

  const note = (req.body.note || "").replace(/<[^>]*>/g, "").substring(0, 500);

  RFQ.submitQuote(rfqId, { supplier_id: supplierId, unit_price: unitPrice, moq, delivery_days: deliveryDays, note }, (err, data) => {
    if (err) return res.status(500).render("error", { message: "Error submitting quote" });
    res.redirect("/admin/rfqs/" + rfqId);
  });
};
