const Order = require("../models/order.model");
const Product = require("../models/product.model");

exports.createForm = (req, res) => {
  Product.findById(req.params.productId, (err, data) => {
    if (err) { res.status(404).render("error", { message: "Product not found" }); return; }
    res.render("order-create", { product: data });
  });
};

exports.create = (req, res) => {
  if (!req.body.quantity || !req.body.product_id) {
    res.status(400).render("error", { message: "Quantity and product are required" });
    return;
  }

  const newOrder = {
    shop_id: req.body.shop_id || 1,
    product_id: req.body.product_id,
    quantity: parseInt(req.body.quantity),
    note: req.body.note || ""
  };

  Order.create(newOrder, (err, data) => {
    if (err) {
      if (err.kind === "insufficient_stock") {
        res.render("error", { message: `Insufficient stock. Available: ${err.available}` });
        return;
      }
      if (err.kind === "product_not_found") {
        res.render("error", { message: "Product not found or inactive" });
        return;
      }
      res.status(500).render("error", { message: "Error creating order" });
      return;
    }
    res.redirect("/orders/" + data.id);
  });
};

exports.findAll = (req, res) => {
  const shopId = req.query.shop_id || 1;
  Order.findByShopId(shopId, (err, data) => {
    if (err) { res.status(500).render("error", { message: "Error retrieving orders" }); return; }
    res.render("order-list", { orders: data });
  });
};

exports.findOne = (req, res) => {
  Order.findById(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") { res.status(404).render("error", { message: "Order not found" }); return; }
      res.status(500).render("error", { message: "Error retrieving order" }); return;
    }
    res.render("order-detail", { order: data });
  });
};
