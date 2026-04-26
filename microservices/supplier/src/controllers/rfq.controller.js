const RFQ = require("../models/rfq.model");
const authService = require("../../../../shared/clients/auth.client");
const shopService = require("../../../../shared/clients/shop.client");

exports.findAll = async (req, res) => {
  try {
    const supplierId = req.session.user.id;

    // Fetch RFQs from Shop service
    const rfqs = await shopService.getRfqsBySupplierId(supplierId);

    // Collect unique IDs for batch requests
    const shopIds = [...new Set(rfqs.map(r => r.shop_id).filter(Boolean))];
    const productIds = [...new Set(rfqs.map(r => r.product_id).filter(Boolean))];

    // Parallel batch fetch — avoid N+1
    const Product = require("../models/product.model");
    const [userMap, products] = await Promise.all([
      authService.getUsersByIds(shopIds, ["id", "full_name"]),
      new Promise((resolve, reject) => {
        if (!productIds.length) return resolve([]);
        Product.findByIds(productIds, (err, data) => err ? reject(err) : resolve(data));
      })
    ]);
    const productMap = products.reduce((map, p) => { map[p.id] = p; return map; }, {});

    // Enrich — preserve original JSON contract
    const enriched = rfqs.map(r => ({
      ...r,
      shop_name: userMap[r.shop_id]?.full_name || "Unknown Shop",
      product_name: productMap[r.product_id]?.name || "Unknown Product",
      image_url: productMap[r.product_id]?.image_url || ""
    }));

    console.log("[RFQ.findAll] Success. Enriched %d RFQs", enriched.length);
    res.render("rfq-list", { rfqs: enriched });
  } catch (err) {
    console.error("[RFQ.findAll Error] Critical Failure:", err.message);
    res.status(500).render("error", { message: "Error retrieving RFQs: " + err.message });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).render("error", { message: "Invalid RFQ ID" });

    // Fetch RFQ from Shop service
    const rfq = await shopService.getRfqById(id);
    if (!rfq) return res.status(404).render("error", { message: "RFQ not found" });
    if (rfq.supplier_id !== req.session.user.id) {
      return res.status(403).render("error", { message: "You can only view RFQs sent to your supplier account" });
    }

    // Fetch quote locally
    const quote = await new Promise((resolve, reject) => {
      RFQ.getQuoteByRfqId(id, (err, data) => err ? reject(err) : resolve(data));
    });

    // Fetch product locally + user names from Auth
    const Product = require("../models/product.model");
    const [product, userMap] = await Promise.all([
      new Promise((resolve, reject) => {
        Product.findById(rfq.product_id, (err, data) => err ? resolve(null) : resolve(data));
      }),
      authService.getUsersByIds(
        [rfq.shop_id, rfq.supplier_id].filter(Boolean),
        ["id", "full_name"]
      )
    ]);

    // Compose — preserve original JSON contract
    const enriched = {
      ...rfq,
      product_name: product?.name || "Unknown Product",
      list_price: product?.price || 0,
      image_url: product?.image_url || "",
      shop_name: userMap[rfq.shop_id]?.full_name || "Unknown Shop",
      supplier_name: userMap[rfq.supplier_id]?.full_name || "Unknown Supplier",
      quote_id: quote?.id || null,
      unit_price: quote?.unit_price || null,
      moq: quote?.moq || null,
      delivery_days: quote?.delivery_days || null,
      quote_note: quote?.note || null,
      quote_status: quote?.status || null
    };

    res.render("rfq-detail", { rfq: enriched });
  } catch (err) {
    console.error("[RFQ.findOne Error]", err.message);
    res.status(500).render("error", { message: "Error retrieving RFQ" });
  }
};

exports.submitQuote = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id);
    if (isNaN(rfqId) || rfqId < 1) return res.status(400).render("error", { message: "Invalid RFQ ID" });

    const unitPrice = parseFloat(req.body.unit_price);
    const moq = parseInt(req.body.moq) || 1;
    const deliveryDays = parseInt(req.body.delivery_days) || 7;
    const supplierId = req.session.user.id;

    if (isNaN(unitPrice) || unitPrice <= 0) return res.status(400).render("error", { message: "Valid unit price is required" });
    if (moq < 1) return res.status(400).render("error", { message: "MOQ must be at least 1" });

    const note = (req.body.note || "").replace(/<[^>]*>/g, "").substring(0, 500);

    const rfq = await shopService.getRfqById(rfqId);
    if (!rfq) return res.status(404).render("error", { message: "RFQ not found" });
    if (rfq.supplier_id !== supplierId) {
      return res.status(403).render("error", { message: "You can only quote RFQs sent to your supplier account" });
    }
    if (rfq.status !== "pending") {
      return res.status(400).render("error", { message: "Only pending RFQs can be quoted" });
    }

    const existingQuote = await new Promise((resolve, reject) => {
      RFQ.getQuoteByRfqId(rfqId, (err, data) => err ? reject(err) : resolve(data));
    });
    if (existingQuote) {
      return res.status(400).render("error", { message: "This RFQ already has a quote" });
    }

    // Insert quote locally
    const quote = await new Promise((resolve, reject) => {
      RFQ.submitQuote(rfqId, { supplier_id: supplierId, unit_price: unitPrice, moq, delivery_days: deliveryDays, note }, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });

    // Update RFQ status in Shop service
    try {
      await shopService.updateRfqStatus(rfqId, "quoted");
    } catch (err) {
      await safelyDeleteQuote(quote.id);
      console.error("[RFQ.submitQuote] Failed to update RFQ status in Shop:", err.message);
      return res.status(502).render("error", { message: "Quote could not be submitted because RFQ status was not updated" });
    }

    res.redirect("/admin/rfqs/" + rfqId);
  } catch (err) {
    console.error("[RFQ.submitQuote Error]", err.message);
    res.status(500).render("error", { message: "Error submitting quote" });
  }
};

function deleteQuoteById(id) {
  return new Promise((resolve, reject) => {
    RFQ.deleteQuoteById(id, (err, data) => err ? reject(err) : resolve(data));
  });
}

async function safelyDeleteQuote(id) {
  try {
    await deleteQuoteById(id);
  } catch (err) {
    console.error(`[RFQ.submitQuote] Failed to remove local quote ${id}:`, err.message);
  }
}
