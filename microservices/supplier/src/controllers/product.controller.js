const Product = require("../models/product.model");
const authService = require("../../../../shared/clients/auth.client");
const { upload, uploadToS3, deleteFromS3 } = require("../config/s3");

exports.findAll = async (req, res) => {
  try {
    const allProducts = await new Promise((resolve, reject) => {
      Product.getAll((err, data) => err ? reject(err) : resolve(data));
    });
    const products = allProducts.filter(p => p.supplier_id === req.session.user.id);

    // Batch fetch supplier names — avoid N+1
    const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))];
    const userMap = await authService.getUsersByIds(supplierIds, ["id", "full_name"]);

    // Enrich — preserve original JSON contract
    const enriched = products.map(p => ({
      ...p,
      supplier_name: userMap[p.supplier_id]?.full_name || "Unknown Supplier"
    }));

    res.render("product-list", { products: enriched });
  } catch (err) {
    console.error("[Product.findAll Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving products" });
  }
};

exports.shopPreview = async (req, res) => {
  try {
    // Use getAllActive instead of loading all products and filtering in memory
    const products = await new Promise((resolve, reject) => {
      Product.getAllActive((err, data) => err ? reject(err) : resolve(data));
    });
    res.render("shop-preview", { products });
  } catch (err) {
    res.status(500).render("error", { message: "Error loading shop preview" });
  }
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
    // Ownership check: only the product owner or admin can edit
    if (req.session.user.role !== "admin" && data.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only edit your own products" });
    }
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

      // Ownership check before update
      const existing = await new Promise((resolve, reject) => {
        Product.findById(id, (err, data) => err ? reject(err) : resolve(data));
      });
      if (req.session.user.role !== "admin" && existing.supplier_id !== req.session.user.id) {
        return res.status(403).render("error", { message: "You can only update your own products" });
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

      if (req.file) {
        imageUrl = await uploadToS3(req.file);
        if (req.body.existing_image_url) {
          await deleteFromS3(req.body.existing_image_url).catch(e => console.error("[S3 Delete Error]", e.message));
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
      console.error("[Product.update Error]", err.message);
      res.status(500).render("error", { message: "Error updating product" });
    }
  }
];

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) {
    return res.status(400).render("error", { message: "Invalid product ID" });
  }

  try {
    const product = await new Promise((resolve, reject) => {
      Product.findById(id, (err, data) => err ? reject(err) : resolve(data));
    });

    // Ownership check: only the product owner or admin can delete
    if (req.session.user.role !== "admin" && product.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only delete your own products" });
    }

    await new Promise((resolve, reject) => {
      Product.remove(id, (err) => err ? reject(err) : resolve());
    });

    // Clean up S3 image after successful deletion
    if (product.image_url) {
      await deleteFromS3(product.image_url).catch(e => console.error("[S3 Delete Error]", e.message));
    }

    res.redirect("/admin/products");
  } catch (err) {
    console.error("[Product.remove Error]", err.message);
    res.status(500).render("error", { message: "Error deleting product" });
  }
};
