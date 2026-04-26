#!/bin/sh
set -eu

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

escape_sql() {
  printf "%s" "$1" | sed "s/'/''/g"
}

APP_DB_USER_SQL="$(escape_sql "$APP_DB_USER")"
APP_DB_PASSWORD_SQL="$(escape_sql "$APP_DB_PASSWORD")"

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
CREATE USER IF NOT EXISTS '${APP_DB_USER_SQL}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD_SQL}';
GRANT ALL PRIVILEGES ON auth_db.* TO '${APP_DB_USER_SQL}'@'%';
GRANT ALL PRIVILEGES ON shop_db.* TO '${APP_DB_USER_SQL}'@'%';
GRANT ALL PRIVILEGES ON supplier_db.* TO '${APP_DB_USER_SQL}'@'%';
FLUSH PRIVILEGES;
EOSQL
