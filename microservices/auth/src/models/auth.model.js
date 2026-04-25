const pool = require("../config/db");
const bcrypt = require("bcryptjs");

const Auth = {};

Auth.register = (userData, result) => {
    bcrypt.hash(userData.password, 10, (err, hash) => {
        if (err) { result(err, null); return; }
        pool.query(
            "INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, 'pending')",
            [userData.email, hash, userData.full_name, userData.role || "shop"],
            (err, res) => {
                if (err) {
                    if (err.code === "ER_DUP_ENTRY") { result({ kind: "duplicate" }, null); return; }
                    result(err, null); return;
                }
                result(null, { id: res.insertId, email: userData.email, full_name: userData.full_name, role: userData.role });
            }
        );
    });
};

Auth.login = (email, password, result) => {
    pool.query("SELECT * FROM users WHERE email = ?", [email], (err, res) => {
        if (err) { result(err, null); return; }
        if (!res.length) { result({ kind: "not_found" }, null); return; }

        const user = res[0];
        if (user.status !== "approved") {
            result({ kind: "not_approved", status: user.status }, null);
            return;
        }

        bcrypt.compare(password, user.password_hash, (err, match) => {
            if (err) { result(err, null); return; }
            if (!match) { result({ kind: "wrong_password" }, null); return; }
            result(null, { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.status });
        });
    });
};

Auth.findById = (id, result) => {
    pool.query("SELECT id, email, full_name, role, status, created_at FROM users WHERE id = ?", [id], (err, res) => {
        if (err) { result(err, null); return; }
        if (!res.length) { result({ kind: "not_found" }, null); return; }
        result(null, res[0]);
    });
};

// Batch query — for inter-service API
Auth.findByIds = (ids, fields, result) => {
    const allowedFields = ["id", "email", "full_name", "role", "status", "created_at"];
    const selectedFields = fields && fields.length
        ? fields.filter(f => allowedFields.includes(f))
        : ["id", "email", "full_name", "role", "status"];
    if (!selectedFields.includes("id")) selectedFields.unshift("id");
    const fieldStr = selectedFields.join(", ");
    pool.query(
        `SELECT ${fieldStr} FROM users WHERE id IN (?)`,
        [ids],
        (err, res) => {
            if (err) { result(err, null); return; }
            result(null, res);
        }
    );
};

Auth.getAllUsers = (result) => {
    pool.query("SELECT id, email, full_name, role, status, created_at FROM users ORDER BY created_at DESC", (err, res) => {
        if (err) { result(err, null); return; }
        result(null, res);
    });
};

Auth.approveUser = (id, result) => {
    pool.query("UPDATE users SET status = 'approved' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
        if (err) { result(err, null); return; }
        if (res.affectedRows == 0) { result({ kind: "not_found_or_already" }, null); return; }
        result(null, { id, status: "approved" });
    });
};

Auth.rejectUser = (id, result) => {
    pool.query("UPDATE users SET status = 'rejected' WHERE id = ? AND status = 'pending'", [id], (err, res) => {
        if (err) { result(err, null); return; }
        if (res.affectedRows == 0) { result({ kind: "not_found_or_already" }, null); return; }
        result(null, { id, status: "rejected" });
    });
};

Auth.deleteUser = (id, result) => {
    pool.query("DELETE FROM users WHERE id = ? AND role != 'admin'", [id], (err, res) => {
        if (err) { result(err, null); return; }
        if (res.affectedRows == 0) { result({ kind: "not_found_or_admin" }, null); return; }
        result(null, { id, deleted: true });
    });
};

Auth.updateProfile = (id, data, result) => {
    pool.query("UPDATE users SET full_name = ?, email = ? WHERE id = ?", [data.full_name, data.email, id], (err, res) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY") { result({ kind: "duplicate" }, null); return; }
            result(err, null); return;
        }
        result(null, { id, ...data });
    });
};

Auth.changePassword = (id, oldPassword, newPassword, result) => {
    pool.query("SELECT password_hash FROM users WHERE id = ?", [id], (err, res) => {
        if (err) { result(err, null); return; }
        if (!res.length) { result({ kind: "not_found" }, null); return; }

        bcrypt.compare(oldPassword, res[0].password_hash, (err, match) => {
            if (err) { result(err, null); return; }
            if (!match) { result({ kind: "wrong_password" }, null); return; }

            bcrypt.hash(newPassword, 10, (err, hash) => {
                if (err) { result(err, null); return; }
                pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id], (err) => {
                    if (err) { result(err, null); return; }
                    result(null, { success: true });
                });
            });
        });
    });
};

Auth.getUserCount = (result) => {
    pool.query("SELECT COUNT(*) as count FROM users", (err, res) => {
        if (err) { result(err, null); return; }
        result(null, res[0].count);
    });
};

Auth.getPendingUserCount = (result) => {
    pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'pending'", (err, res) => {
        if (err) { result(err, null); return; }
        result(null, res[0].count);
    });
};

module.exports = Auth;
