const Product = require("../models/product.model");

exports.findAll = (req, res) => {
  Product.getAll((err, data) => {
    if (err) { res.status(500).render("error", { message: "Error retrieving products" }); return; }
    res.render("product-list", { products: data });
  });
};

exports.createForm = (req, res) => {
  res.render("product-add");
};

exports.create = (req, res) => {
  if (!req.body.name || !req.body.price) {
    res.status(400).render("error", { message: "Name and price are required" }); return;
  }
  const newProduct = {
    supplier_id: req.body.supplier_id || 1,
    name: req.body.name,
    description: req.body.description || "",
    price: parseFloat(req.body.price),
    stock: parseInt(req.body.stock) || 0,
    category: req.body.category || ""
  };
  Product.create(newProduct, (err, data) => {
    if (err) { res.status(500).render("error", { message: "Error creating product" }); return; }
    res.redirect("/admin/products");
  });
};

exports.editForm = (req, res) => {
  Product.findById(req.params.id, (err, data) => {
    if (err) { res.status(404).render("error", { message: "Product not found" }); return; }
    res.render("product-update", { product: data });
  });
};

exports.update = (req, res) => {
  Product.updateById(req.params.id, {
    name: req.body.name,
    description: req.body.description,
    price: parseFloat(req.body.price),
    stock: parseInt(req.body.stock),
    category: req.body.category
  }, (err) => {
    if (err) { res.status(500).render("error", { message: "Error updating product" }); return; }
    res.redirect("/admin/products");
  });
};

exports.remove = (req, res) => {
  Product.remove(req.params.id, (err) => {
    if (err) { res.status(500).render("error", { message: "Error deleting product" }); return; }
    res.redirect("/admin/products");
  });
};
