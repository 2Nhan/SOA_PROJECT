const express = require("express");
const path = require("path");
const app = express();

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Controllers
const productController = require("./app/controller/product.controller");
const orderController = require("./app/controller/order.controller");
const paymentController = require("./app/controller/payment.controller");

// Routes - Supplier/Admin Service (all prefixed with /admin)
app.get("/admin/", (req, res) => {
  res.render("dashboard");
});

// Products - full CRUD
app.get("/admin/products", productController.findAll);
app.get("/admin/products/add", productController.createForm);
app.post("/admin/products", productController.create);
app.get("/admin/products/edit/:id", productController.editForm);
app.post("/admin/products/update/:id", productController.update);
app.post("/admin/products/delete/:id", productController.remove);

// Orders - manage
app.get("/admin/orders", orderController.findAll);
app.get("/admin/orders/:id", orderController.findOne);
app.post("/admin/orders/:id/confirm", orderController.confirm);
app.post("/admin/orders/:id/cancel", orderController.cancel);

// Payments
app.get("/admin/orders/:id/payment", paymentController.processForm);
app.post("/admin/orders/:id/payment", paymentController.process);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Supplier service running on port ${PORT}`);
});
