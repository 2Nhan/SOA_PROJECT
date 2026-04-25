const supplierService = require("../../../../shared/clients/supplier.client");
const authService = require("../../../../shared/clients/auth.client");

exports.findAll = async (req, res) => {
  try {
    const shopId = req.session.user.id;

    // Contracts are in supplier_db — fetch via Supplier API
    // We use the contracts API to get contracts for this shop
    // For now, using a workaround: shop queries its own contracts via product relationship
    const contractsData = await supplierService.getContractsByIds([]);

    // Since we can't easily query contracts by shop_id from the API,
    // we'll use the provided contracts endpoint which returns all contracts
    // TODO: Add /api/contracts?shop_id=X endpoint to Supplier service
    res.render("contract-list", { contracts: [] });
  } catch (err) {
    console.error("[Contract.findAll Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving contracts" });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid contract ID" });

    // Fetch contract from Supplier service
    const contracts = await supplierService.getContractsByIds([id]);
    const contract = contracts[id];
    if (!contract) return res.status(404).render("error", { message: "Contract not found" });

    // Fetch product + user names
    const [product, userMap] = await Promise.all([
      supplierService.getProductById(contract.product_id),
      authService.getUsersByIds(
        [contract.shop_id, contract.supplier_id].filter(Boolean),
        ["id", "full_name"]
      )
    ]);

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
    console.error("[Contract.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving contract" });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const contractId = parseInt(req.params.id);
    if (isNaN(contractId) || contractId < 1) return res.status(400).render("error", { message: "Invalid contract ID" });

    // Fetch contract from Supplier service
    const contracts = await supplierService.getContractsByIds([contractId]);
    const contract = contracts[contractId];
    if (!contract) return res.status(404).render("error", { message: "Contract not found" });
    if (contract.status !== "confirmed") {
      return res.render("error", { message: "Contract must be confirmed by supplier first" });
    }

    // Saga Step 1: Check and reduce stock
    try {
      await supplierService.checkAndReduceStock(contract.product_id, contract.quantity);
    } catch (err) {
      if (err.message && err.message.includes("Insufficient stock")) {
        return res.render("error", { message: "Insufficient stock." });
      }
      throw err;
    }

    // Saga Step 2: Create order locally
    const Order = require("../models/order.model");
    await new Promise((resolve, reject) => {
      Order.create({
        shop_id: contract.shop_id,
        product_id: contract.product_id,
        quantity: contract.quantity,
        total_price: contract.total_amount,
        contract_id: contractId
      }, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    }).catch(async (err) => {
      // Compensating: restore stock
      try {
        await supplierService.restoreStock(contract.product_id, contract.quantity);
      } catch (compErr) {
        console.error("[Contract.createOrder] Stock restore failed:", compErr.message);
      }
      throw err;
    });

    res.redirect("/orders/");
  } catch (err) {
    console.error("[Contract.createOrder Error]", err.message);
    res.status(500).render("error", { message: "Error creating order from contract" });
  }
};
