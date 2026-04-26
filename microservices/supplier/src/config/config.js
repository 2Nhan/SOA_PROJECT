function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
  return process.env[name];
}

const dbConfig = {
  HOST: process.env.APP_DB_HOST || "localhost",
  USER: process.env.APP_DB_USER || "admin",
  PASSWORD: requiredEnv("APP_DB_PASSWORD"),
  DB: process.env.APP_DB_NAME || "supplier_db",
  PORT: process.env.APP_DB_PORT || 3306
};

module.exports = dbConfig;
