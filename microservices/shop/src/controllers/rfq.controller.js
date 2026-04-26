const RFQ = require("../models/rfq.model");
const supplierService = require("../../../../shared/clients/supplier.client");
const authService = require("../../../../shared/clients/auth.client");

exports.findAll = async (req, res) => {
  try {
    const shopId = req.session.user.id;

    // Query RFQs from local shop_db
    const rfqs = await new Promise((resolve, reject) => {
      RFQ.findByShopId(shopId, (err, data) => err ? reject(err) : resolve(data));
    });

    // Collect unique IDs
    const supplierIds = [...new Set(rfqs.map(r => r.supplier_id).filter(Boolean))];
    const productIds = [...new Set(rfqs.map(r => r.product_id).filter(Boolean))];
    const rfqIds = rfqs.map(r => r.id);

    // Parallel batch fetch — avoid N+1
    const [userMap, productMap, quoteMap] = await Promise.all([
      authService.getUsersByIds(supplierIds, ["id", "full_name"]),
      supplierService.getProductsByIds(productIds, ["id", "name", "image_url"]),
      supplierService.getQuotesByRfqIds(rfqIds)
    ]);

    // Enrich — preserve original JSON contract
    const enriched = rfqs.map(r => {
      const quotes = quoteMap[r.id] || [];
      const quote = quotes[0] || {};
      return {
        ...r,
        supplier_name: userMap[r.supplier_id]?.full_name || "Unknown Supplier",
        product_name: productMap[r.product_id]?.name || "Unknown Product",
        image_url: productMap[r.product_id]?.image_url || "",
        quoted_price: quote.unit_price || null,
        moq: quote.moq || null,
        delivery_days: quote.delivery_days || null,
        quote_id: quote.id || null,
        quote_status: quote.status || null
      };
    });

    res.render("rfq-list", { rfqs: enriched });
  } catch (err) {
    console.error("[RFQ.findAll Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving RFQs" });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid RFQ ID" });

    // Local query
    const rfq = await new Promise((resolve, reject) => {
      RFQ.findById(id, (err, data) => {
        if (err) { if (err.kind === "not_found") return reject({ status: 404 }); return reject(err); }
        resolve(data);
      });
    });
    if (rfq.shop_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only view your own RFQs" });
    }

    // Parallel: product + users + quote
    const userIds = [rfq.supplier_id, rfq.shop_id].filter(Boolean);
    const [product, userMap, quoteMap] = await Promise.all([
      supplierService.getProductById(rfq.product_id),
      authService.getUsersByIds(userIds, ["id", "full_name"]),
      supplierService.getQuotesByRfqIds([rfq.id])
    ]);

    const quotes = quoteMap[rfq.id] || [];
    const quote = quotes[0] || {};

    const enriched = {
      ...rfq,
      product_name: product?.name || "Unknown Product",
      list_price: product?.price || 0,
      image_url: product?.image_url || "",
      product_desc: product?.description || "",
      supplier_name: userMap[rfq.supplier_id]?.full_name || "Unknown Supplier",
      shop_name: userMap[rfq.shop_id]?.full_name || "Unknown Shop",
      quote_id: quote.id || null,
      quoted_price: quote.unit_price || null,
      moq: quote.moq || null,
      delivery_days: quote.delivery_days || null,
      quote_note: quote.note || null,
      quote_status: quote.status || null
    };

    res.render("rfq-detail", { rfq: enriched });
  } catch (err) {
    if (err.status === 404) return res.status(404).render("error", { message: "RFQ not found" });
    console.error("[RFQ.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving RFQ" });
  }
};

exports.createForm = async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId) || productId < 1) return res.status(400).render("error", { message: "Invalid product ID" });

    // Fetch product from Supplier service
    const product = await supplierService.getProductById(productId);
    if (!product || !product.id) return res.status(404).render("error", { message: "Product not found" });
    if (product.status !== "active") {
      return res.status(404).render("error", { message: "Product not found or inactive" });
    }

    // Fetch supplier name
    const userMap = await authService.getUsersByIds([product.supplier_id], ["id", "full_name"]);
    product.supplier_name = userMap[product.supplier_id]?.full_name || "Unknown Supplier";

    res.render("rfq-create", { product });
  } catch (err) {
    console.error("[RFQ.createForm Error]", err.message);
    res.status(500).render("error", { message: "Error loading RFQ form" });
  }
};

exports.create = async (req, res) => {
  const quantity = parseInt(req.body.quantity);
  const productId = parseInt(req.body.product_id);
  const supplierId = parseInt(req.body.supplier_id);
  const shopId = req.session.user.id;

  if (!quantity || !productId || !supplierId || isNaN(quantity)) {
    return res.status(400).render("error", { message: "All fields are required" });
  }
  if (quantity < 1 || quantity > 100000) {
    return res.status(400).render("error", { message: "Quantity must be between 1 and 100,000" });
  }

  const note = (req.body.note || "").replace(/<[^>]*>/g, "").substring(0, 500);

  try {
    const product = await supplierService.getProductById(productId);
    if (!product || product.status !== "active" || product.supplier_id !== supplierId) {
      return res.status(400).render("error", { message: "Invalid product or supplier" });
    }
  } catch (err) {
    return res.status(500).render("error", { message: "Error validating product" });
  }

  RFQ.create({ shop_id: shopId, supplier_id: supplierId, product_id: productId, quantity, note }, (err, data) => {
    if (err) return res.status(500).render("error", { message: "Error creating RFQ" });
    res.redirect("/rfqs/" + data.id);
  });
};

exports.acceptQuote = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id);
    const quoteId = parseInt(req.params.quoteId);
    if (isNaN(rfqId) || isNaN(quoteId)) return res.status(400).render("error", { message: "Invalid IDs" });

    // Fetch RFQ details locally
    const rfq = await new Promise((resolve, reject) => {
      RFQ.findById(rfqId, (err, data) => {
        if (err) { if (err.kind === "not_found") return reject({ status: 404 }); return reject(err); }
        resolve(data);
      });
    });
    if (rfq.shop_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only accept quotes for your own RFQs" });
    }
    if (rfq.status !== "quoted") {
      return res.status(400).render("error", { message: "Only quoted RFQs can be accepted" });
    }

    // Fetch the quote from supplier service to get pricing details
    const quoteMap = await supplierService.getQuotesByRfqIds([rfqId]);
    const quotes = quoteMap[rfqId] || [];
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return res.status(404).render("error", { message: "Quote not found" });
    if (quote.supplier_id !== rfq.supplier_id) {
      return res.status(400).render("error", { message: "Quote does not match this RFQ" });
    }

    // Create contract in Supplier service
    await supplierService.createContract({
      quote_id: quoteId,
      shop_id: rfq.shop_id,
      supplier_id: rfq.supplier_id,
      product_id: rfq.product_id,
      quantity: rfq.quantity,
      unit_price: quote.unit_price,
      total_amount: (quote.unit_price || 0) * rfq.quantity,
      delivery_days: quote.delivery_days || 7
    });

    // Update RFQ status locally after contract creation succeeds.
    await new Promise((resolve, reject) => {
      RFQ.acceptQuote(rfqId, (err) => err ? reject(err) : resolve());
    });

    res.redirect("/contracts");
  } catch (err) {
    if (err.status === 404) return res.status(404).render("error", { message: "RFQ not found" });
    console.error("[RFQ.acceptQuote Error]", err.message);
    res.status(500).render("error", { message: "Error accepting quote" });
  }
};

exports.rejectQuote = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id);
    const quoteId = parseInt(req.params.quoteId);
    if (isNaN(rfqId) || isNaN(quoteId)) return res.status(400).render("error", { message: "Invalid IDs" });

    const rfq = await new Promise((resolve, reject) => {
      RFQ.findById(rfqId, (err, data) => {
        if (err) { if (err.kind === "not_found") return reject({ status: 404 }); return reject(err); }
        resolve(data);
      });
    });
    if (rfq.shop_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only reject quotes for your own RFQs" });
    }
    if (rfq.status !== "quoted") {
      return res.status(400).render("error", { message: "Only quoted RFQs can be rejected" });
    }

    const quoteMap = await supplierService.getQuotesByRfqIds([rfqId]);
    const quotes = quoteMap[rfqId] || [];
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return res.status(404).render("error", { message: "Quote not found" });
    if (quote.supplier_id !== rfq.supplier_id) {
      return res.status(400).render("error", { message: "Quote does not match this RFQ" });
    }

    await supplierService.updateQuoteStatus(quoteId, "rejected");

    // Update RFQ status locally
    await new Promise((resolve, reject) => {
      RFQ.rejectQuote(rfqId, (err) => err ? reject(err) : resolve());
    });

    res.redirect("/rfqs");
  } catch (err) {
    if (err.status === 404) return res.status(404).render("error", { message: "RFQ not found" });
    console.error("[RFQ.rejectQuote Error]", err.message);
    res.status(500).render("error", { message: "Error rejecting quote" });
  }
};
