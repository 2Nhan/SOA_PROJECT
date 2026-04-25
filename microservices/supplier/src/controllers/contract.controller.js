const Contract = require("../models/contract.model");
const authService = require("../../../../shared/clients/auth.client");
const shopService = require("../../../../shared/clients/shop.client");
const Product = require("../models/product.model");

exports.findAll = async (req, res) => {
  try {
    const supplierId = req.session.user.id;
    const contracts = await new Promise((resolve, reject) => {
      Contract.findBySupplierId(supplierId, (err, data) => err ? reject(err) : resolve(data));
    });

    // Batch fetch product + user data — parallel
    const productIds = [...new Set(contracts.map(c => c.product_id).filter(Boolean))];
    const shopIds = [...new Set(contracts.map(c => c.shop_id).filter(Boolean))];

    const [products, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        if (!productIds.length) return resolve([]);
        Product.findByIds(productIds, (err, data) => err ? reject(err) : resolve(data));
      }),
      authService.getUsersByIds(shopIds, ["id", "full_name"])
    ]);
    const productMap = products.reduce((map, p) => { map[p.id] = p; return map; }, {});

    // Enrich — preserve original JSON contract
    const enriched = contracts.map(c => ({
      ...c,
      product_name: productMap[c.product_id]?.name || "Unknown Product",
      image_url: productMap[c.product_id]?.image_url || "",
      shop_name: userMap[c.shop_id]?.full_name || "Unknown Shop"
    }));

    res.render("contract-list", { contracts: enriched });
  } catch (err) {
    console.error("[Contract.findAll Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving contracts" });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid contract ID" });

    const contract = await new Promise((resolve, reject) => {
      Contract.findById(id, (err, data) => {
        if (err) { if (err.kind === "not_found") return reject({ status: 404 }); return reject(err); }
        resolve(data);
      });
    });

    // Fetch product locally + user names from Auth — parallel
    const userIds = [contract.shop_id, contract.supplier_id].filter(Boolean);
    const [product, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        Product.findById(contract.product_id, (err, data) => err ? resolve(null) : resolve(data));
      }),
      authService.getUsersByIds(userIds, ["id", "full_name"])
    ]);

    // Enrich
    const enriched = {
      ...contract,
      product_name: product?.name || "Unknown Product",
      image_url: product?.image_url || "",
      product_desc: product?.description || "",
      shop_name: userMap[contract.shop_id]?.full_name || "Unknown Shop",
      supplier_name: userMap[contract.supplier_id]?.full_name || "Unknown Supplier"
    };

    res.render("contract-detail", { contract: enriched });
  } catch (err) {
    if (err.status === 404) return res.status(404).render("error", { message: "Contract not found" });
    console.error("[Contract.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving contract" });
  }
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
