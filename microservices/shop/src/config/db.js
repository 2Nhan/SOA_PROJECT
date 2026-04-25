const dbConfig = require("./config");
const { createDbPool } = require("../../../../shared/config/db.config");

module.exports = createDbPool(dbConfig);
