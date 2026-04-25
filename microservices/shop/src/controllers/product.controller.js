const supplierService = require("../../../../shared/clients/supplier.client");
const authService = require("../../../../shared/clients/auth.client");

exports.findAll = async (req, res) => {
  try {
    const keyword = (req.query.search || "").replace(/<[^>]*>/g, "").substring(0, 100);

    // Fetch products from Supplier service
    let products;
    if (keyword) {
      products = await supplierService.searchProducts(keyword);
    } else {
      products = await supplierService.getAllActiveProducts();
    }

    // Batch fetch supplier names from Auth
    const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))];
    const userMap = await authService.getUsersByIds(supplierIds, ["id", "full_name"]);

    // Enrich — preserve original JSON contract
    const enriched = products.map(p => ({
      ...p,
      supplier_name: userMap[p.supplier_id]?.full_name || "Unknown Supplier"
    }));

    res.render("product-list", { products: enriched, keyword: keyword });
  } catch (err) {
    console.error("[Product.findAll Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving products." });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).render("error", { message: "Invalid product ID" });
    }

    // Fetch product from Supplier service
    const product = await supplierService.getProductById(id);
    if (!product || !product.id) return res.status(404).render("error", { message: "Product not found" });

    // Fetch supplier name from Auth
    const userMap = await authService.getUsersByIds([product.supplier_id], ["id", "full_name"]);
    product.supplier_name = userMap[product.supplier_id]?.full_name || "Unknown Supplier";

    res.render("product-detail", { product });
  } catch (err) {
    console.error("[Product.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving product" });
  }
};
