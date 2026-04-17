const dbConfig = {
  HOST: process.env.APP_DB_HOST || "localhost",
  USER: process.env.APP_DB_USER || "admin",
  PASSWORD: process.env.APP_DB_PASSWORD || "lab-password",
  DB: process.env.APP_DB_NAME || "b2bmarket",
  PORT: process.env.APP_DB_PORT || 3306
};

module.exports = dbConfig;
