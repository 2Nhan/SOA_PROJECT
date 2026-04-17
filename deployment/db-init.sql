-- B2B Marketplace Database Schema
-- Run this on RDS MySQL instance

CREATE DATABASE IF NOT EXISTS b2bmarket;
USE b2bmarket;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role ENUM('shop', 'supplier', 'admin') DEFAULT 'shop',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(12, 2),
  stock INT DEFAULT 0,
  status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
  image_url VARCHAR(500),
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES users(id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  status ENUM('pending', 'confirmed', 'paid', 'cancelled') DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  method ENUM('bank_transfer', 'qr_code', 'cod') DEFAULT 'bank_transfer',
  status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Seed data: Users
INSERT INTO users (email, password_hash, full_name, role) VALUES
('shop1@b2bmarket.com', 'hashed_password', 'ABC Retail Shop', 'shop'),
('supplier1@b2bmarket.com', 'hashed_password', 'XYZ Supplies Co.', 'supplier'),
('admin@b2bmarket.com', 'hashed_password', 'System Admin', 'admin');

-- Seed data: Products
INSERT INTO products (supplier_id, name, description, price, stock, status, category) VALUES
(2, 'Premium Arabica Coffee Beans', 'High-quality Arabica beans from Vietnam highlands, medium roast', 24.99, 100, 'active', 'Coffee'),
(2, 'Robusta Coffee Beans 1kg', 'Strong Robusta beans, dark roast, perfect for espresso', 18.50, 200, 'active', 'Coffee'),
(2, 'Green Tea Matcha Powder', 'Organic matcha powder from Japanese tea gardens', 32.00, 50, 'active', 'Tea'),
(2, 'Ceramic Coffee Mug Set (4pcs)', 'Handcrafted ceramic mugs, microwave safe', 45.00, 30, 'active', 'Accessories'),
(2, 'Stainless Steel Coffee Filter', 'Vietnamese phin coffee filter, durable stainless steel', 12.99, 150, 'active', 'Accessories'),
(2, 'Organic Honey 500ml', 'Pure organic wildflower honey from central highlands', 15.75, 80, 'active', 'Condiments');
