/**
 * Auth Service Client — HTTP client for inter-service communication
 * Used by Shop and Supplier services to fetch user data from Auth service
 */
const http = require("http");

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:8082";
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 3000;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "b2b-internal-key-change-in-production";

/**
 * HTTP GET with timeout — uses native http module (no extra dependencies)
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
                    reject(new Error("Invalid JSON response from Auth service"));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Auth service timeout after ${timeoutMs}ms`));
        });
        req.on("error", (err) => {
            reject(new Error(`Auth service unreachable: ${err.message}`));
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
                    reject(new Error("Invalid JSON response from Auth service"));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Auth service timeout after ${timeoutMs}ms`));
        });
        req.on("error", (err) => {
            reject(new Error(`Auth service unreachable: ${err.message}`));
        });
        req.write(postData);
        req.end();
    });
}

/**
 * Batch fetch users by IDs — returns Map<id, user> for O(1) lookup
 * Avoids N+1 problem: single request for multiple users
 */
async function getUsersByIds(ids, fields) {
    if (!ids || !ids.length) return {};
    const uniqueIds = [...new Set(ids)].filter(id => id > 0);
    if (!uniqueIds.length) return {};

    const fieldsParam = fields && fields.length ? `&fields=${fields.join(",")}` : "";
    const url = `${AUTH_SERVICE_URL}/api/auth/users?ids=${uniqueIds.join(",")}${fieldsParam}`;

    try {
        const users = await httpGet(url, TIMEOUT_MS);
        return users.reduce((map, u) => { map[u.id] = u; return map; }, {});
    } catch (err) {
        console.warn(`[AuthService] getUsersByIds failed: ${err.message}`);
        // Fallback: return placeholder users
        return uniqueIds.reduce((map, id) => {
            map[id] = getFallbackUser(id);
            return map;
        }, {});
    }
}

/**
 * Get single user by ID
 */
async function getUserById(id) {
    try {
        return await httpGet(`${AUTH_SERVICE_URL}/api/auth/users/${id}`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[AuthService] getUserById(${id}) failed: ${err.message}`);
        return getFallbackUser(id);
    }
}

/**
 * Get all users — for admin management
 */
async function getAllUsers() {
    return await httpGet(`${AUTH_SERVICE_URL}/api/auth/users/all`, TIMEOUT_MS);
}

/**
 * Get user stats — for admin dashboard
 */
async function getUserStats() {
    try {
        return await httpGet(`${AUTH_SERVICE_URL}/api/auth/users/stats`, TIMEOUT_MS);
    } catch (err) {
        console.warn(`[AuthService] getUserStats failed: ${err.message}`);
        return { totalUsers: 0, pendingUsers: 0 };
    }
}

/**
 * Approve user
 */
async function approveUser(id) {
    return await httpPost(`${AUTH_SERVICE_URL}/api/auth/users/${id}/approve`, {}, TIMEOUT_MS);
}

/**
 * Reject user
 */
async function rejectUser(id) {
    return await httpPost(`${AUTH_SERVICE_URL}/api/auth/users/${id}/reject`, {}, TIMEOUT_MS);
}

/**
 * Delete user
 */
async function deleteUser(id) {
    return await httpPost(`${AUTH_SERVICE_URL}/api/auth/users/${id}/delete`, {}, TIMEOUT_MS);
}

/**
 * Login via Auth API
 */
async function loginUser(email, password) {
    return await httpPost(`${AUTH_SERVICE_URL}/api/auth/login`, { email, password }, TIMEOUT_MS);
}

/**
 * Register via Auth API
 */
async function registerUser(userData) {
    return await httpPost(`${AUTH_SERVICE_URL}/api/auth/register`, userData, TIMEOUT_MS);
}

/**
 * Fallback user data when Auth service is unavailable
 */
function getFallbackUser(id) {
    return { id, full_name: "User #" + id, email: "", role: "unknown", status: "unknown" };
}

/**
 * Wrap a promise with fallback — for resilience
 */
function withFallback(promise, fallbackValue) {
    return promise.catch(err => {
        console.warn(`[AuthService] Call failed, using fallback: ${err.message}`);
        return fallbackValue;
    });
}

module.exports = {
    getUsersByIds,
    getUserById,
    getAllUsers,
    getUserStats,
    approveUser,
    rejectUser,
    deleteUser,
    loginUser,
    registerUser,
    getFallbackUser,
    withFallback
};
