const Order = require("../models/order.model");
const supplierService = require("../../../../shared/clients/supplier.client");
const authService = require("../../../../shared/clients/auth.client");

exports.createForm = async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId) || productId < 1) {
      return res.status(400).render("error", { message: "Invalid product ID" });
    }

    // Fetch product from Supplier service
    const product = await supplierService.getProductById(productId);
    if (!product || !product.id) return res.status(404).render("error", { message: "Product not found" });

    // Fetch supplier name
    const userMap = await authService.getUsersByIds([product.supplier_id], ["id", "full_name"]);
    product.supplier_name = userMap[product.supplier_id]?.full_name || "Unknown Supplier";

    res.render("order-create", { product });
  } catch (err) {
    console.error("[Order.createForm Error]", err.message);
    res.status(500).render("error", { message: "Error loading order form" });
  }
};

exports.create = async (req, res) => {
  try {
    const quantity = parseInt(req.body.quantity);
    const productId = parseInt(req.body.product_id);
    const shopId = req.session.user.id;

    if (!quantity || !productId || isNaN(quantity) || isNaN(productId)) {
      return res.status(400).render("error", { message: "Valid quantity and product are required" });
    }
    if (quantity < 1 || quantity > 10000) {
      return res.status(400).render("error", { message: "Quantity must be between 1 and 10,000" });
    }

    const note = (req.body.note || "").replace(/<[^>]*>/g, "").substring(0, 500);

    // Saga Step 1: Check and reduce stock via Supplier API
    let stockResult;
    try {
      stockResult = await supplierService.checkAndReduceStock(productId, quantity);
    } catch (err) {
      if (err.message && err.message.includes("Insufficient stock")) {
        return res.render("error", { message: "Insufficient stock." });
      }
      if (err.message && err.message.includes("not found")) {
        return res.render("error", { message: "Product not found or inactive" });
      }
      throw err;
    }

    // Saga Step 2: Insert order in shop_db
    const totalPrice = stockResult.price * quantity;
    const orderResult = await new Promise((resolve, reject) => {
      Order.create({ shop_id: shopId, product_id: productId, quantity, total_price: totalPrice, note }, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    }).catch(async (err) => {
      // Saga compensating: restore stock if order insert fails
      try {
        await supplierService.restoreStock(productId, quantity);
      } catch (compErr) {
        console.error("[Order.create] Compensating stock restore failed:", compErr.message);
      }
      throw err;
    });

    res.redirect("/orders/" + orderResult.id);
  } catch (err) {
    console.error("[Order.create Error]", err.message);
    res.status(500).render("error", { message: "Error creating order" });
  }
};

exports.findAll = async (req, res) => {
  try {
    const shopId = req.session.user.id;
    const orders = await new Promise((resolve, reject) => {
      Order.findByShopId(shopId, (err, data) => err ? reject(err) : resolve(data));
    });

    // Batch fetch product data from Supplier
    const productIds = [...new Set(orders.map(o => o.product_id).filter(Boolean))];
    const productMap = await supplierService.getProductsByIds(productIds, ["id", "name", "image_url"]);

    // Enrich — preserve original JSON contract
    const enriched = orders.map(o => ({
      ...o,
      product_name: productMap[o.product_id]?.name || "Unknown Product",
      image_url: productMap[o.product_id]?.image_url || ""
    }));

    res.render("order-list", { orders: enriched });
  } catch (err) {
    console.error("[Order.findAll Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving orders" });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).render("error", { message: "Invalid order ID" });
    }

    const order = await new Promise((resolve, reject) => {
      Order.findById(id, (err, data) => {
        if (err) { if (err.kind === "not_found") return reject({ status: 404 }); return reject(err); }
        resolve(data);
      });
    });

    // Parallel: product + supplier name
    const product = await supplierService.getProductById(order.product_id);
    const supplierUserMap = await authService.getUsersByIds(
      [product?.supplier_id].filter(Boolean),
      ["id", "full_name"]
    );

    const enriched = {
      ...order,
      product_name: product?.name || "Unknown Product",
      unit_price: product?.price || 0,
      image_url: product?.image_url || "",
      supplier_name: supplierUserMap[product?.supplier_id]?.full_name || "Unknown Supplier"
    };

    res.render("order-detail", { order: enriched });
  } catch (err) {
    if (err.status === 404) return res.status(404).render("error", { message: "Order not found" });
    console.error("[Order.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving order" });
  }
};
