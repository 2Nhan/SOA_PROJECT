const Product = require("../models/product.model");

exports.findAll = (req, res) => {
  const keyword = req.query.search || "";
  const handler = (err, data) => {
    if (err) { res.status(500).send({ message: err.message || "Error retrieving products." }); return; }
    res.render("product-list", { products: data, keyword: keyword });
  };
  if (keyword) {
    Product.search(keyword, handler);
  } else {
    Product.getAll(handler);
  }
};

exports.findOne = (req, res) => {
  Product.findById(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") { res.status(404).render("error", { message: "Product not found" }); return; }
      res.status(500).render("error", { message: "Error retrieving product" }); return;
    }
    res.render("product-detail", { product: data });
  });
};
