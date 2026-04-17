const Admin = require("../models/admin.model");
const Contract = require("../models/contract.model");

// Dashboard with stats
exports.dashboard = (req, res) => {
  Admin.getStats((err, stats) => {
    if (err) return res.status(500).render("error", { message: "Error loading dashboard" });
    res.render("admin-dashboard", { stats });
  });
};

// ---- USERS ----

exports.users = (req, res) => {
  Admin.getAllUsers((err, data) => {
    if (err) return res.status(500).render("error", { message: "Error retrieving users" });
    res.render("admin-users", { users: data });
  });
};

exports.approveUser = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).render("error", { message: "Invalid user ID" });
  Admin.approveUser(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error approving user" });
    res.redirect("/admin/manage/users");
  });
};

exports.rejectUser = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).render("error", { message: "Invalid user ID" });
  Admin.rejectUser(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error rejecting user" });
    res.redirect("/admin/manage/users");
  });
};

exports.deleteUser = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).render("error", { message: "Invalid user ID" });
  Admin.deleteUser(id, (err) => {
    if (err) {
      if (err.kind === "not_found_or_admin") return res.render("error", { message: "Cannot delete admin accounts" });
      return res.status(500).render("error", { message: "Error deleting user" });
    }
    res.redirect("/admin/manage/users");
  });
};

// ---- PRODUCT APPROVAL ----

exports.pendingProducts = (req, res) => {
  Admin.getPendingProducts((err, data) => {
    if (err) return res.status(500).render("error", { message: "Error retrieving pending products" });
    res.render("admin-products", { products: data });
  });
};

exports.approveProduct = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).render("error", { message: "Invalid product ID" });
  Admin.approveProduct(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error approving product" });
    res.redirect("/admin/manage/products");
  });
};

exports.rejectProduct = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).render("error", { message: "Invalid product ID" });
  Admin.rejectProduct(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error rejecting product" });
    res.redirect("/admin/manage/products");
  });
};

exports.deleteProduct = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).render("error", { message: "Invalid product ID" });
  Admin.deleteProduct(id, (err) => {
    if (err) return res.status(500).render("error", { message: "Error deleting product" });
    res.redirect("/admin/manage/products");
  });
};

// ---- RFQs ----

exports.rfqs = (req, res) => {
  Admin.getAllRFQs((err, data) => {
    if (err) return res.status(500).render("error", { message: "Error retrieving RFQs" });
    res.render("admin-rfqs", { rfqs: data });
  });
};

// ---- CONTRACTS ----

exports.contracts = (req, res) => {
  Contract.getAll((err, data) => {
    if (err) return res.status(500).render("error", { message: "Error retrieving contracts" });
    res.render("admin-contracts", { contracts: data });
  });
};
