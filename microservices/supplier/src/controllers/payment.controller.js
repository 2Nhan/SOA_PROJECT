const Payment = require("../models/payment.model");
const shopClient = require("../../../../shared/clients/shop.client");
const Product = require("../models/product.model");

const VALID_METHODS = ["bank_transfer", "qr_code", "cod"];

exports.processForm = (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId) || orderId < 1) {
    return res.status(400).render("error", { message: "Invalid order ID" });
  }
  res.render("payment-process", { order_id: orderId });
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

  try {
    // Get order from Shop service — check status
    const order = await shopClient.getOrderById(orderId);
    if (!order) return res.render("error", { message: "Order not found" });
    if (order.status !== "confirmed") {
      return res.render("error", { message: "Order must be confirmed before payment" });
    }

    // Insert payment record locally
    const payment = await new Promise((resolve, reject) => {
      Payment.process(orderId, order.total_price, method, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });

    // Update order status to 'paid' in Shop service
    try {
      await shopClient.updateOrderStatus(orderId, "paid");
    } catch (err) {
      // Compensating: if order update fails, payment already recorded
      console.error("[Payment] Failed to update order status:", err.message);
    }

    res.redirect("/admin/orders/" + orderId);
  } catch (err) {
    console.error("[Payment.process Error]", err.message);

    // Compensating transaction: cancel order + restore stock
    try {
      const order = await shopClient.getOrderById(orderId);
      if (order) {
        await shopClient.updateOrderStatus(orderId, "cancelled");
        await new Promise((resolve) => {
          Product.restoreStock(order.product_id, order.quantity, () => resolve());
        });
      }
    } catch (compErr) {
      console.error("[Payment] Compensating transaction failed:", compErr.message);
    }

    res.render("error", { message: "Payment failed. Order cancelled and stock restored." });
  }
};
