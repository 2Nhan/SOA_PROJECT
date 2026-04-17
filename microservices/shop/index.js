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

// Routes - Shop (Customer) Service
app.get("/", (req, res) => {
  res.render("home");
});

// Products - read only
app.get("/products", productController.findAll);
app.get("/products/:id", productController.findOne);

// Orders - create + read
app.get("/orders", orderController.findAll);
app.get("/orders/new/:productId", orderController.createForm);
app.post("/orders", orderController.create);
app.get("/orders/:id", orderController.findOne);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Shop service running on port ${PORT}`);
});
