const RFQ = require("../models/rfq.model");

exports.findAll = (req, res) => {
  const shopId = parseInt(req.query.shop_id) || 1;
  RFQ.findByShopId(shopId, (err, data) => {
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

exports.createForm = (req, res) => {
  const Product = require("../models/product.model");
  const productId = parseInt(req.params.productId);
  if (isNaN(productId) || productId < 1) return res.status(400).render("error", { message: "Invalid product ID" });
  Product.findById(productId, (err, data) => {
    if (err) return res.status(404).render("error", { message: "Product not found" });
    res.render("rfq-create", { product: data });
  });
};

exports.create = (req, res) => {
  const quantity = parseInt(req.body.quantity);
  const productId = parseInt(req.body.product_id);
  const supplierId = parseInt(req.body.supplier_id);
  const shopId = parseInt(req.body.shop_id) || 1;

  if (!quantity || !productId || !supplierId || isNaN(quantity)) {
    return res.status(400).render("error", { message: "All fields are required" });
  }
  if (quantity < 1 || quantity > 100000) {
    return res.status(400).render("error", { message: "Quantity must be between 1 and 100,000" });
  }

  const note = (req.body.note || "").replace(/<[^>]*>/g, "").substring(0, 500);

  RFQ.create({ shop_id: shopId, supplier_id: supplierId, product_id: productId, quantity, note }, (err, data) => {
    if (err) return res.status(500).render("error", { message: "Error creating RFQ" });
    res.redirect("/rfqs/" + data.id);
  });
};

exports.acceptQuote = (req, res) => {
  const rfqId = parseInt(req.params.id);
  const quoteId = parseInt(req.params.quoteId);
  if (isNaN(rfqId) || isNaN(quoteId)) return res.status(400).render("error", { message: "Invalid IDs" });

  RFQ.acceptQuote(rfqId, quoteId, (err, data) => {
    if (err) {
      if (err.kind === "not_found") return res.status(404).render("error", { message: "Quote not found" });
      return res.status(500).render("error", { message: "Error accepting quote" });
    }
    res.redirect("/contracts/" + data.contract_id);
  });
};

exports.rejectQuote = (req, res) => {
  const rfqId = parseInt(req.params.id);
  const quoteId = parseInt(req.params.quoteId);
  if (isNaN(rfqId) || isNaN(quoteId)) return res.status(400).render("error", { message: "Invalid IDs" });

  RFQ.rejectQuote(rfqId, quoteId, (err) => {
    if (err) return res.status(500).render("error", { message: "Error rejecting quote" });
    res.redirect("/rfqs");
  });
};
