const authService = require("../../../../shared/clients/auth.client");
const shopService = require("../../../../shared/clients/shop.client");
const Product = require("../models/product.model");
const Order = require("../models/order.model");

exports.findAll = async (req, res) => {
  try {
    // Fetch all orders from Shop service
    const allOrders = await shopService.getAllOrders();

    // Batch fetch product + user data — parallel
    const productIds = [...new Set(allOrders.map(o => o.product_id).filter(Boolean))];
    const shopIds = [...new Set(allOrders.map(o => o.shop_id).filter(Boolean))];

    const [products, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        if (!productIds.length) return resolve([]);
        Product.findByIds(productIds, (err, data) => err ? reject(err) : resolve(data));
      }),
      authService.getUsersByIds(shopIds, ["id", "full_name"])
    ]);
    const productMap = products.reduce((map, p) => { map[p.id] = p; return map; }, {});
    const orders = allOrders.filter(o => productMap[o.product_id]?.supplier_id === req.session.user.id);

    // Enrich — preserve original JSON contract
    const enriched = orders.map(o => ({
      ...o,
      product_name: productMap[o.product_id]?.name || "Unknown Product",
      image_url: productMap[o.product_id]?.image_url || "",
      shop_name: userMap[o.shop_id]?.full_name || "Unknown Shop"
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
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid order ID" });

    // Fetch order from Shop service
    const order = await shopService.getOrderById(id);
    if (!order) return res.status(404).render("error", { message: "Order not found" });

    // Fetch product locally + user name from Auth — parallel
    const [product, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        Product.findById(order.product_id, (err, data) => err ? resolve(null) : resolve(data));
      }),
      authService.getUsersByIds([order.shop_id].filter(Boolean), ["id", "full_name"])
    ]);
    if (!product || product.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only view orders for your products" });
    }

    // Enrich
    const enriched = {
      ...order,
      product_name: product?.name || "Unknown Product",
      unit_price: product?.price || 0,
      image_url: product?.image_url || "",
      shop_name: userMap[order.shop_id]?.full_name || "Unknown Shop"
    };

    res.render("order-detail", { order: enriched });
  } catch (err) {
    console.error("[Order.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving order" });
  }
};

exports.confirm = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid order ID" });

    const order = await shopService.getOrderById(id);
    if (!order) return res.status(404).render("error", { message: "Order not found" });
    const product = await findProduct(order.product_id);
    if (!product || product.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only confirm orders for your products" });
    }
    if (order.status !== "pending") {
      return res.status(400).render("error", { message: "Only pending orders can be confirmed" });
    }

    // Update order status in Shop service
    await shopService.updateOrderStatus(id, "confirmed");
    res.redirect("/admin/orders/" + id);
  } catch (err) {
    console.error("[Order.confirm Error]", err.message);
    res.status(500).render("error", { message: "Cannot confirm order" });
  }
};

exports.cancel = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid order ID" });

    // Get order details from Shop to know product_id and quantity
    const order = await shopService.getOrderById(id);
    if (!order) return res.status(404).render("error", { message: "Order not found" });
    const product = await findProduct(order.product_id);
    if (!product || product.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only cancel orders for your products" });
    }
    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).render("error", { message: "Only pending or confirmed orders can be cancelled" });
    }

    // Cancel order in Shop service
    await shopService.updateOrderStatus(id, "cancelled");

    // Compensating transaction: restore stock locally
    await new Promise((resolve, reject) => {
      Order.restoreStock(order.product_id, order.quantity, (err) => err ? reject(err) : resolve());
    });

    res.redirect("/admin/orders/" + id);
  } catch (err) {
    console.error("[Order.cancel Error]", err.message);
    res.status(500).render("error", { message: "Cannot cancel order" });
  }
};

function findProduct(id) {
  return new Promise((resolve, reject) => {
    Product.findById(id, (err, data) => err ? reject(err) : resolve(data));
  });
}
