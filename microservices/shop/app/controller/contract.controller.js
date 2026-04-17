const Contract = require("../models/contract.model");

exports.findAll = (req, res) => {
  const shopId = req.session.user.id;
  Contract.findByShopId(shopId, (err, data) => {
    if (err) return res.status(500).render("error", { message: "Error retrieving contracts" });
    res.render("contract-list", { contracts: data });
  });
};

exports.findOne = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid contract ID" });
  Contract.findById(id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") return res.status(404).render("error", { message: "Contract not found" });
      return res.status(500).render("error", { message: "Error retrieving contract" });
    }
    res.render("contract-detail", { contract: data });
  });
};

exports.createOrder = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid contract ID" });
  Contract.createOrder(id, (err, data) => {
    if (err) {
      if (err.kind === "not_confirmed") return res.render("error", { message: "Contract must be confirmed by supplier first" });
      if (err.kind === "insufficient_stock") return res.render("error", { message: `Insufficient stock. Available: ${err.available}` });
      return res.status(500).render("error", { message: "Error creating order from contract" });
    }
    res.redirect("/orders/" + data.order_id);
  });
};
