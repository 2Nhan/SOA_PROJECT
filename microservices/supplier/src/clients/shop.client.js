/**
 * Shop Service Client — HTTP client for Supplier to call Shop service
 * Used to fetch RFQ and Order data
 */
const http = require("http");

const SHOP_SERVICE_URL = process.env.SHOP_SERVICE_URL || "http://localhost:8080";
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 3000;

/**
 * HTTP GET with timeout
 */
function httpGet(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
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
                    reject(new Error("Invalid JSON response from Shop service"));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Shop service timeout after ${timeoutMs}ms`));
        });
        req.on("error", (err) => {
            reject(new Error(`Shop service unreachable: ${err.message}`));
        });
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
                "Content-Length": Buffer.byteLength(postData)
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
                    reject(new Error("Invalid JSON response from Shop service"));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Shop service timeout after ${timeoutMs}ms`));
        });
        req.on("error", (err) => {
            reject(new Error(`Shop service unreachable: ${err.message}`));
        });
        req.write(postData);
        req.end();
    });
}

/**
 * Get RFQs by supplier ID
 */
async function getRfqsBySupplierId(supplierId) {
    return await httpGet(`${SHOP_SERVICE_URL}/api/rfqs?supplier_id=${supplierId}`, TIMEOUT_MS);
}

/**
 * Get RFQ by ID
 */
async function getRfqById(id) {
    try {
        return await httpGet(`${SHOP_SERVICE_URL}/api/rfqs/${id}`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[ShopService] getRfqById(${id}) failed: ${err.message}`);
        return null;
    }
}

/**
 * Update RFQ status
 */
async function updateRfqStatus(rfqId, status) {
    return await httpPost(`${SHOP_SERVICE_URL}/api/rfqs/${rfqId}/status`, { status }, TIMEOUT_MS);
}

/**
 * Get orders (all or by product IDs for supplier viewing)
 */
async function getAllOrders() {
    return await httpGet(`${SHOP_SERVICE_URL}/api/orders/all`, TIMEOUT_MS);
}

/**
 * Get order by ID
 */
async function getOrderById(id) {
    try {
        return await httpGet(`${SHOP_SERVICE_URL}/api/orders/${id}`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[ShopService] getOrderById(${id}) failed: ${err.message}`);
        return null;
    }
}

/**
 * Update order status
 */
async function updateOrderStatus(orderId, status) {
    return await httpPost(`${SHOP_SERVICE_URL}/api/orders/${orderId}/status`, { status }, TIMEOUT_MS);
}

/**
 * Get stats for admin dashboard
 */
async function getShopStats() {
    try {
        return await httpGet(`${SHOP_SERVICE_URL}/api/stats`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[ShopService] getShopStats failed: ${err.message}`);
        return { totalOrders: 0, totalRFQs: 0 };
    }
}

/**
 * Get all RFQs (for admin overview)
 */
async function getAllRfqs() {
    return await httpGet(`${SHOP_SERVICE_URL}/api/rfqs/all`, TIMEOUT_MS);
}

module.exports = {
    getRfqsBySupplierId,
    getRfqById,
    updateRfqStatus,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    getShopStats,
    getAllRfqs
};
