const Payment = require("../models/payment.model");
const shopClient = require("../../../../shared/clients/shop.client");
const Product = require("../models/product.model");

const VALID_METHODS = ["bank_transfer", "qr_code", "cod"];

exports.processForm = async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId) || orderId < 1) {
    return res.status(400).render("error", { message: "Invalid order ID" });
  }

  try {
    const order = await shopClient.getOrderById(orderId);
    if (!order) return res.status(404).render("error", { message: "Order not found" });
    const product = await findProduct(order.product_id);
    if (!product || product.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only process payments for your products" });
    }
    if (order.status !== "confirmed") {
      return res.render("error", { message: "Order must be confirmed before payment" });
    }
    res.render("payment-process", { order_id: orderId });
  } catch (err) {
    console.error("[Payment.processForm Error]", err.message);
    res.status(500).render("error", { message: "Error loading payment form" });
  }
};

exports.process = async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId) || orderId < 1) {
    return res.status(400).render("error", { message: "Invalid order ID" });
  }

  const method = req.body.method || "bank_transfer";
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).render("error", { message: "Invalid payment method" });
  }

  let paymentId = null;
  try {
    // Get order from Shop service — check status
    const order = await shopClient.getOrderById(orderId);
    if (!order) return res.render("error", { message: "Order not found" });
    const product = await findProduct(order.product_id);
    if (!product || product.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only process payments for your products" });
    }
    if (order.status !== "confirmed") {
      return res.render("error", { message: "Order must be confirmed before payment" });
    }
    // Insert payment record locally as pending, then finalize after Shop confirms the order status update.
    const payment = await new Promise((resolve, reject) => {
      Payment.process(orderId, order.total_price, method, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
    paymentId = payment.id;

    // Update order status to 'paid' in Shop service
    try {
      await shopClient.updateOrderStatus(orderId, "paid");
    } catch (err) {
      await safelyUpdatePaymentStatus(paymentId, "failed");
      console.error("[Payment] Failed to update order status:", err.message);
      return res.status(502).render("error", { message: "Payment could not be finalized. Order status was not changed." });
    }

    await updatePaymentStatus(paymentId, "success");

    res.redirect("/admin/orders/" + orderId);
  } catch (err) {
    console.error("[Payment.process Error]", err.message);

    if (paymentId) {
      await safelyUpdatePaymentStatus(paymentId, "failed");
    }

    res.render("error", { message: "Payment failed. Order status was not changed." });
  }
};

function findProduct(id) {
  return new Promise((resolve, reject) => {
    Product.findById(id, (err, data) => err ? reject(err) : resolve(data));
  });
}

function updatePaymentStatus(id, status) {
  return new Promise((resolve, reject) => {
    Payment.updateStatus(id, status, (err, data) => err ? reject(err) : resolve(data));
  });
}

async function safelyUpdatePaymentStatus(id, status) {
  try {
    await updatePaymentStatus(id, status);
  } catch (err) {
    console.error(`[Payment] Failed to mark payment ${id} as ${status}:`, err.message);
  }
}
