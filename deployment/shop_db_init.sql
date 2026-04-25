-- Shop Database Schema
-- Database per Service: Shop owns rfqs and orders
-- Cross-DB Foreign Keys removed; replaced with logical INT references

CREATE DATABASE IF NOT EXISTS shop_db;
USE shop_db;

-- RFQ (Request for Quotation) table
-- shop_id, supplier_id reference auth_db.users logically
-- product_id references supplier_db.products logically
CREATE TABLE IF NOT EXISTS rfqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  supplier_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  note TEXT,
  status ENUM('pending', 'quoted', 'accepted', 'rejected', 'expired') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Orders table
-- contract_id references supplier_db.contracts logically
-- shop_id references auth_db.users logically
-- product_id references supplier_db.products logically
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT,
  shop_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  status ENUM('pending', 'confirmed', 'paid', 'delivering', 'delivered', 'cancelled') DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed data: Sample RFQ
INSERT INTO rfqs (shop_id, supplier_id, product_id, quantity, note, status) VALUES
(1, 2, 1, 50, 'Need bulk order for our new branch opening', 'quoted');
