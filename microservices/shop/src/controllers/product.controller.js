const supplierService = require("../../../../shared/clients/supplier.client");
const authService = require("../../../../shared/clients/auth.client");

exports.findAll = async (req, res) => {
  try {
    const keyword = (req.query.search || "").replace(/<[^>]*>/g, "").substring(0, 100);

    // Fetch products from Supplier service
    let products = [];
    try {
      if (keyword) {
        products = await supplierService.searchProducts(keyword);
      } else {
        products = await supplierService.getAllActiveProducts();
      }
    } catch (err) {
      console.error("[Product.findAll] Supplier API Failure:", err.message);
      // Fallback: empty list instead of 500, but log the error
      return res.render("product-list", { products: [], keyword: keyword, error: "Supplier service is currently unavailable." });
    }

    // Defensive check: ensure products is an array
    if (!Array.isArray(products)) {
      console.error("[Product.findAll] Unexpected response format from Supplier:", typeof products);
      products = [];
    }

    // Batch fetch supplier names from Auth
    const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))];
    const userMap = await authService.getUsersByIds(supplierIds, ["id", "full_name"]);

    // Enrich — preserve original JSON contract
    const enriched = products.map(p => {
      try {
        return {
          ...p,
          supplier_name: userMap[p.supplier_id]?.full_name || "Unknown Supplier"
        };
      } catch (mapErr) {
        console.error("[Product.findAll] Enrichment failed for product:", p.id, mapErr.message);
        return { ...p, supplier_name: "Unknown Supplier" };
      }
    });

    console.log("[Product.findAll] Success. Rendering %d products", enriched.length);
    res.render("product-list", { products: enriched, keyword: keyword });
  } catch (err) {
    console.error("[Product.findAll Error] FATAL:", err.message);
    console.error(err.stack);
    res.status(500).render("error", { message: "Internal Server Error: " + err.message });
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
    if (product.status !== "active") return res.status(404).render("error", { message: "Product not found" });

    // Fetch supplier name from Auth
    const userMap = await authService.getUsersByIds([product.supplier_id], ["id", "full_name"]);
    product.supplier_name = userMap[product.supplier_id]?.full_name || "Unknown Supplier";

    res.render("product-detail", { product });
  } catch (err) {
    console.error("[Product.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving product" });
  }
};
