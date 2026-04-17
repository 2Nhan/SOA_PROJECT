const Contract = require("../models/contract.model");

exports.findAll = (req, res) => {
  const supplierId = parseInt(req.query.supplier_id) || 2;
  Contract.findBySupplierId(supplierId, (err, data) => {
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

exports.confirm = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid contract ID" });
  Contract.confirm(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error confirming contract" });
    res.redirect("/admin/contracts/" + id);
  });
};

exports.cancel = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid contract ID" });
  Contract.cancel(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error cancelling contract" });
    res.redirect("/admin/contracts");
  });
};
