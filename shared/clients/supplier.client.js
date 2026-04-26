/**
 * Supplier Service Client — HTTP client for inter-service communication
 * Used by Shop service to fetch product data, check stock, etc.
 */
const http = require("http");

const SUPPLIER_SERVICE_URL = process.env.SUPPLIER_SERVICE_URL || "http://localhost:8081";
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 8000;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "b2b-internal-key-change-in-production";

/**
 * HTTP GET with timeout
 */
function httpGet(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: "GET",
            timeout: timeoutMs,
            headers: { "X-Internal-Api-Key": INTERNAL_API_KEY }
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        return;
                    }
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Invalid JSON response from Supplier service"));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Supplier service timeout after ${timeoutMs}ms`));
        });
        req.on("error", (err) => {
            reject(new Error(`Supplier service unreachable: ${err.message}`));
        });
        req.end();
    });
}

/**
 * HTTP POST with timeout
 */
function httpPost(url, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(body);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: "POST",
            timeout: timeoutMs,
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData),
                "X-Internal-Api-Key": INTERNAL_API_KEY
            }
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                        return;
                    }
                    resolve(parsed);
                } catch (e) {
                    reject(new Error("Invalid JSON response from Supplier service"));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Supplier service timeout after ${timeoutMs}ms`));
        });
        req.on("error", (err) => {
            reject(new Error(`Supplier service unreachable: ${err.message}`));
        });
        req.write(postData);
        req.end();
    });
}

/**
 * Batch fetch products by IDs — returns Map<id, product>
 */
async function getProductsByIds(ids, fields) {
    if (!ids || !ids.length) return {};
    const uniqueIds = [...new Set(ids)].filter(id => id > 0);
    if (!uniqueIds.length) return {};

    const fieldsParam = fields && fields.length ? `&fields=${fields.join(",")}` : "";
    const url = `${SUPPLIER_SERVICE_URL}/api/supplier/products?ids=${uniqueIds.join(",")}${fieldsParam}`;

    try {
        const products = await httpGet(url, TIMEOUT_MS);
        return products.reduce((map, p) => { map[p.id] = p; return map; }, {});
    } catch (err) {
        console.warn(`[SupplierService] getProductsByIds failed: ${err.message}`);
        return uniqueIds.reduce((map, id) => {
            map[id] = getFallbackProduct(id);
            return map;
        }, {});
    }
}

/**
 * Get single product by ID
 */
async function getProductById(id) {
    try {
        return await httpGet(`${SUPPLIER_SERVICE_URL}/api/supplier/products/${id}`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[SupplierService] getProductById(${id}) failed: ${err.message}`);
        return getFallbackProduct(id);
    }
}

/**
 * Get all active products (from all suppliers)
 */
async function getAllActiveProducts() {
    return await httpGet(`${SUPPLIER_SERVICE_URL}/api/supplier/products/active`, TIMEOUT_MS);
}

/**
 * Search products
 */
async function searchProducts(keyword) {
    return await httpGet(`${SUPPLIER_SERVICE_URL}/api/supplier/products/search?q=${encodeURIComponent(keyword)}`, TIMEOUT_MS);
}

/**
 * Check stock and reduce — Saga step 1
 * Returns { success: true, price } or throws error
 */
async function checkAndReduceStock(productId, quantity) {
    return await httpPost(`${SUPPLIER_SERVICE_URL}/api/supplier/products/${productId}/reduce-stock`, { quantity }, TIMEOUT_MS);
}

/**
 * Restore stock — Saga compensating transaction
 */
async function restoreStock(productId, quantity) {
    return await httpPost(`${SUPPLIER_SERVICE_URL}/api/supplier/products/${productId}/restore-stock`, { quantity }, TIMEOUT_MS);
}

/**
 * Get quotes by RFQ IDs (batch)
 */
async function getQuotesByRfqIds(rfqIds) {
    if (!rfqIds || !rfqIds.length) return {};
    const url = `${SUPPLIER_SERVICE_URL}/api/supplier/quotes?rfq_ids=${rfqIds.join(",")}`;
    try {
        const quotes = await httpGet(url, TIMEOUT_MS);
        // Group by rfq_id for easy lookup
        return quotes.reduce((map, q) => {
            if (!map[q.rfq_id]) map[q.rfq_id] = [];
            map[q.rfq_id].push(q);
            return map;
        }, {});
    } catch (err) {
        console.warn(`[SupplierService] getQuotesByRfqIds failed: ${err.message}`);
        return {};
    }
}
/**
 * Get contracts data (batch)
 */
async function getContractsByIds(ids) {
    if (!ids || !ids.length) return {};
    const url = `${SUPPLIER_SERVICE_URL}/api/supplier/contracts?ids=${ids.join(",")}`;
    try {
        const contracts = await httpGet(url, TIMEOUT_MS);
        return contracts.reduce((map, c) => { map[c.id] = c; return map; }, {});
    } catch (err) {
        console.warn(`[SupplierService] getContractsByIds failed: ${err.message}`);
        return {};
    }
}

/**
 * Get contracts by shop ID
 */
async function getContractsByShopId(shopId) {
    try {
        return await httpGet(`${SUPPLIER_SERVICE_URL}/api/supplier/contracts/by-shop?shop_id=${shopId}`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[SupplierService] getContractsByShopId failed: ${err.message}`);
        return [];
    }
}

/**
 * Create contract from accepted quote
 */
async function createContractFromQuote(data) {
    return await httpPost(`${SUPPLIER_SERVICE_URL}/api/supplier/contracts`, data, TIMEOUT_MS);
}

/**
 * Fallback product data when Supplier service is down
 */
function getFallbackProduct(id) {
    return { id, name: "Product #" + id, price: 0, stock: 0, image_url: "", supplier_id: 0, category: "" };
}

module.exports = {
    getProductsByIds,
    getProductById,
    getAllActiveProducts,
    searchProducts,
    checkAndReduceStock,
    restoreStock,
    getQuotesByRfqIds,
    getContractsByIds,
    getContractsByShopId,
    createContractFromQuote,
    getFallbackProduct
};
