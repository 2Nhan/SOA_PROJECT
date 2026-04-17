const Product = require("../models/product.model");
const { upload, uploadToS3, deleteFromS3 } = require("../config/s3");

exports.findAll = (req, res) => {
  Product.getAll((err, data) => {
    if (err) { res.status(500).render("error", { message: "Error retrieving products" }); return; }
    res.render("product-list", { products: data });
  });
};

exports.createForm = (req, res) => {
  res.render("product-add");
};

exports.create = [
  upload.single("image"),
  async (req, res) => {
    try {
      const name = (req.body.name || "").trim().replace(/<[^>]*>/g, "");
      const price = parseFloat(req.body.price);

      if (!name || name.length < 2 || name.length > 255) {
        return res.status(400).render("error", { message: "Product name must be 2-255 characters" });
      }
      if (isNaN(price) || price < 0 || price > 999999.99) {
        return res.status(400).render("error", { message: "Price must be between 0 and 999,999.99" });
      }

      const stock = parseInt(req.body.stock) || 0;
      if (stock < 0 || stock > 1000000) {
        return res.status(400).render("error", { message: "Stock must be between 0 and 1,000,000" });
      }

      let imageUrl = "";
      if (req.file) {
        imageUrl = await uploadToS3(req.file);
      }

      const newProduct = {
        supplier_id: req.session.user.id,
        name: name,
        description: (req.body.description || "").replace(/<[^>]*>/g, "").substring(0, 2000),
        price: price,
        stock: stock,
        category: (req.body.category || "").replace(/<[^>]*>/g, "").substring(0, 100),
        image_url: imageUrl
      };

      Product.create(newProduct, (err, data) => {
        if (err) { res.status(500).render("error", { message: "Error creating product" }); return; }
        res.redirect("/admin/products");
      });
    } catch (err) {
      console.error("[S3 Upload Error]", err.message);
      res.status(500).render("error", { message: "Error uploading image: " + err.message });
    }
  }
];

exports.editForm = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) {
    return res.status(400).render("error", { message: "Invalid product ID" });
  }
  Product.findById(id, (err, data) => {
    if (err) { res.status(404).render("error", { message: "Product not found" }); return; }
    res.render("product-update", { product: data });
  });
};

exports.update = [
  upload.single("image"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) {
        return res.status(400).render("error", { message: "Invalid product ID" });
      }

      const name = (req.body.name || "").trim().replace(/<[^>]*>/g, "");
      const price = parseFloat(req.body.price);
      const stock = parseInt(req.body.stock);

      if (!name || name.length < 2) {
        return res.status(400).render("error", { message: "Product name is required" });
      }
      if (isNaN(price) || price < 0) {
        return res.status(400).render("error", { message: "Valid price is required" });
      }

      let imageUrl = req.body.existing_image_url || "";

      // If new image uploaded, upload to S3 and delete old one
      if (req.file) {
        imageUrl = await uploadToS3(req.file);
        // Delete old image from S3
        if (req.body.existing_image_url) {
          await deleteFromS3(req.body.existing_image_url);
        }
      }

      Product.updateById(id, {
        name: name,
        description: (req.body.description || "").replace(/<[^>]*>/g, "").substring(0, 2000),
        price: price,
        stock: isNaN(stock) ? 0 : stock,
        category: (req.body.category || "").replace(/<[^>]*>/g, "").substring(0, 100),
        image_url: imageUrl
      }, (err) => {
        if (err) { res.status(500).render("error", { message: "Error updating product" }); return; }
        res.redirect("/admin/products");
      });
    } catch (err) {
      console.error("[S3 Upload Error]", err.message);
      res.status(500).render("error", { message: "Error uploading image: " + err.message });
    }
  }
];

exports.remove = (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) {
    return res.status(400).render("error", { message: "Invalid product ID" });
  }
  // Get product first to delete S3 image
  Product.findById(id, (err, product) => {
    if (err) { res.status(500).render("error", { message: "Error deleting product" }); return; }

    Product.remove(id, async (err) => {
      if (err) { res.status(500).render("error", { message: "Error deleting product" }); return; }
      // Delete image from S3
      if (product && product.image_url) {
        await deleteFromS3(product.image_url);
      }
      res.redirect("/admin/products");
    });
  });
};
