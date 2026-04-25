const mysql = require("mysql2");

// Accepts the custom db config object from the caller service
exports.createDbPool = (dbConfig) => {
    return mysql.createPool({
        host: dbConfig.HOST,
        user: dbConfig.USER,
        password: dbConfig.PASSWORD,
        database: dbConfig.DB,
        port: dbConfig.PORT,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
};
