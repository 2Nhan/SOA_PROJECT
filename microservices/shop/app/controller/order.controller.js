const Order = require("../models/order.model");
const Product = require("../models/product.model");

exports.createForm = (req, res) => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId) || productId < 1) {
    return res.status(400).render("error", { message: "Invalid product ID" });
  }
  Product.findById(productId, (err, data) => {
    if (err) { res.status(404).render("error", { message: "Product not found" }); return; }
    res.render("order-create", { product: data });
  });
};

exports.create = (req, res) => {
  // Input validation
  const quantity = parseInt(req.body.quantity);
  const productId = parseInt(req.body.product_id);
  const shopId = req.session.user.id;

  if (!quantity || !productId || isNaN(quantity) || isNaN(productId)) {
    return res.status(400).render("error", { message: "Valid quantity and product are required" });
  }
  if (quantity < 1 || quantity > 10000) {
    return res.status(400).render("error", { message: "Quantity must be between 1 and 10,000" });
  }

  // Sanitize note - strip HTML tags
  const note = (req.body.note || "").replace(/<[^>]*>/g, "").substring(0, 500);

  const newOrder = {
    shop_id: shopId,
    product_id: productId,
    quantity: quantity,
    note: note
  };

  Order.create(newOrder, (err, data) => {
    if (err) {
      if (err.kind === "insufficient_stock") {
        return res.render("error", { message: `Insufficient stock. Available: ${err.available}` });
      }
      if (err.kind === "product_not_found") {
        return res.render("error", { message: "Product not found or inactive" });
      }
      return res.status(500).render("error", { message: "Error creating order" });
    }
    res.redirect("/orders/" + data.id);
  });
};

exports.findAll = (req, res) => {
  const shopId = req.session.user.id;
  Order.findByShopId(shopId, (err, data) => {
    if (err) { res.status(500).render("error", { message: "Error retrieving orders" }); return; }
    res.render("order-list", { orders: data });
  });
};

exports.findOne = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) {
    return res.status(400).render("error", { message: "Invalid order ID" });
  }
  Order.findById(id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") { res.status(404).render("error", { message: "Order not found" }); return; }
      res.status(500).render("error", { message: "Error retrieving order" }); return;
    }
    res.render("order-detail", { order: data });
  });
};
