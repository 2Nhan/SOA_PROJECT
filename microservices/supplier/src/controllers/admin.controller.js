const Admin = require("../models/admin.model");
const Contract = require("../models/contract.model");
const Product = require("../models/product.model");
const authService = require("../../../../shared/clients/auth.client");
const shopService = require("../../../../shared/clients/shop.client");

// Dashboard with stats — aggregated from multiple services
exports.dashboard = async (req, res) => {
  try {
    // Parallel fetch stats from all services
    const [localStats, userStats, shopStats] = await Promise.all([
      new Promise((resolve, reject) => {
        Admin.getLocalStats((err, data) => err ? reject(err) : resolve(data));
      }),
      authService.getUserStats(),
      shopService.getShopStats()
    ]);

    const stats = {
      totalUsers: userStats.totalUsers || 0,
      pendingUsers: userStats.pendingUsers || 0,
      totalProducts: localStats.totalProducts || 0,
      pendingProducts: localStats.pendingProducts || 0,
      totalOrders: shopStats.totalOrders || 0,
      totalRFQs: shopStats.totalRFQs || 0,
      totalContracts: localStats.totalContracts || 0
    };

    res.render("admin-dashboard", { stats });
  } catch (err) {
    console.error("[Admin.dashboard Error]", err.message);
    res.status(500).render("error", { message: "Error loading dashboard" });
  }
};

// ---- USERS (via Auth API) ----

exports.users = async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    res.render("admin-users", { users });
  } catch (err) {
    console.error("[Admin.users Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving users" });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).render("error", { message: "Invalid user ID" });
    await authService.approveUser(id);
    res.redirect("/admin/manage/users");
  } catch (err) {
    console.error("[Admin.approveUser Error]", err.message);
    res.status(500).render("error", { message: "Error approving user" });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).render("error", { message: "Invalid user ID" });
    await authService.rejectUser(id);
    res.redirect("/admin/manage/users");
  } catch (err) {
    console.error("[Admin.rejectUser Error]", err.message);
    res.status(500).render("error", { message: "Error rejecting user" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).render("error", { message: "Invalid user ID" });
    await authService.deleteUser(id);
    res.redirect("/admin/manage/users");
  } catch (err) {
    console.error("[Admin.deleteUser Error]", err.message);
    if (err.message && err.message.includes("Cannot delete admin")) {
      return res.render("error", { message: "Cannot delete admin accounts" });
    }
    res.status(500).render("error", { message: "Error deleting user" });
  }
};

// ---- PRODUCT APPROVAL (local supplier_db) ----

exports.pendingProducts = async (req, res) => {
  try {
    const products = await new Promise((resolve, reject) => {
      Admin.getPendingProducts((err, data) => err ? reject(err) : resolve(data));
    });

    // Enrich with supplier names from Auth API
    const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))];
    const userMap = await authService.getUsersByIds(supplierIds, ["id", "full_name"]);

    const enriched = products.map(p => ({
      ...p,
      supplier_name: userMap[p.supplier_id]?.full_name || "Unknown Supplier"
    }));

    res.render("admin-products", { products: enriched });
  } catch (err) {
    console.error("[Admin.pendingProducts Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving pending products" });
  }
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

// ---- RFQs (via Shop API + enrich) ----

exports.rfqs = async (req, res) => {
  try {
    const rfqs = await shopService.getAllRfqs();

    // Batch enrich with product + user data
    const productIds = [...new Set(rfqs.map(r => r.product_id).filter(Boolean))];
    const userIds = [...new Set([
      ...rfqs.map(r => r.shop_id),
      ...rfqs.map(r => r.supplier_id)
    ].filter(Boolean))];

    const [products, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        if (!productIds.length) return resolve([]);
        Product.findByIds(productIds, (err, data) => err ? reject(err) : resolve(data));
      }),
      authService.getUsersByIds(userIds, ["id", "full_name"])
    ]);
    const productMap = products.reduce((map, p) => { map[p.id] = p; return map; }, {});

    const enriched = rfqs.map(r => ({
      ...r,
      product_name: productMap[r.product_id]?.name || "Unknown Product",
      shop_name: userMap[r.shop_id]?.full_name || "Unknown Shop",
      supplier_name: userMap[r.supplier_id]?.full_name || "Unknown Supplier"
    }));

    res.render("admin-rfqs", { rfqs: enriched });
  } catch (err) {
    console.error("[Admin.rfqs Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving RFQs" });
  }
};

// ---- CONTRACTS (local + enrich) ----

exports.contracts = async (req, res) => {
  try {
    const contracts = await new Promise((resolve, reject) => {
      Contract.getAll((err, data) => err ? reject(err) : resolve(data));
    });

    // Batch enrich
    const productIds = [...new Set(contracts.map(c => c.product_id).filter(Boolean))];
    const userIds = [...new Set([
      ...contracts.map(c => c.shop_id),
      ...contracts.map(c => c.supplier_id)
    ].filter(Boolean))];

    const [products, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        if (!productIds.length) return resolve([]);
        Product.findByIds(productIds, (err, data) => err ? reject(err) : resolve(data));
      }),
      authService.getUsersByIds(userIds, ["id", "full_name"])
    ]);
    const productMap = products.reduce((map, p) => { map[p.id] = p; return map; }, {});

    const enriched = contracts.map(c => ({
      ...c,
      product_name: productMap[c.product_id]?.name || "Unknown Product",
      shop_name: userMap[c.shop_id]?.full_name || "Unknown Shop",
      supplier_name: userMap[c.supplier_id]?.full_name || "Unknown Supplier"
    }));

    res.render("admin-contracts", { contracts: enriched });
  } catch (err) {
    console.error("[Admin.contracts Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving contracts" });
  }
};
