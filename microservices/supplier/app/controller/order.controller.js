const Order = require("../models/order.model");

exports.findAll = (req, res) => {
  Order.getAll((err, data) => {
    if (err) { res.status(500).render("error", { message: "Error retrieving orders" }); return; }
    res.render("order-list", { orders: data });
  });
};

exports.findOne = (req, res) => {
  Order.findById(req.params.id, (err, data) => {
    if (err) { res.status(404).render("error", { message: "Order not found" }); return; }
    res.render("order-detail", { order: data });
  });
};

exports.confirm = (req, res) => {
  Order.confirm(req.params.id, (err) => {
    if (err) { res.status(500).render("error", { message: "Cannot confirm order" }); return; }
    res.redirect("/admin/orders/" + req.params.id);
  });
};

exports.cancel = (req, res) => {
  Order.cancel(req.params.id, (err, data) => {
    if (err) { res.status(500).render("error", { message: "Cannot cancel order" }); return; }
    res.redirect("/admin/orders/" + req.params.id);
  });
};
