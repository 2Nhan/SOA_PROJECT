-- B2B Marketplace Database Schema
-- Run this on RDS MySQL instance

CREATE DATABASE IF NOT EXISTS b2bmarket;
USE b2bmarket;

-- Users table (with approval status for admin workflow)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role ENUM('shop', 'supplier', 'admin') DEFAULT 'shop',
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table (with approval status for admin workflow)
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(12, 2),
  stock INT DEFAULT 0,
  status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
  image_url VARCHAR(500),
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES users(id)
);

-- RFQ (Request for Quotation) table
CREATE TABLE IF NOT EXISTS rfqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  supplier_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  note TEXT,
  status ENUM('pending', 'quoted', 'accepted', 'rejected', 'expired') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES users(id),
  FOREIGN KEY (supplier_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Quotes table (supplier response to RFQ)
CREATE TABLE IF NOT EXISTS quotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rfq_id INT NOT NULL,
  supplier_id INT NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  moq INT DEFAULT 1,
  delivery_days INT DEFAULT 7,
  note TEXT,
  status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rfq_id) REFERENCES rfqs(id),
  FOREIGN KEY (supplier_id) REFERENCES users(id)
);

-- Contracts table (created after quote accepted)
CREATE TABLE IF NOT EXISTS contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quote_id INT NOT NULL,
  shop_id INT NOT NULL,
  supplier_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  delivery_days INT DEFAULT 7,
  status ENUM('draft', 'confirmed', 'completed', 'cancelled') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES quotes(id),
  FOREIGN KEY (shop_id) REFERENCES users(id),
  FOREIGN KEY (supplier_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Orders table (created from contract)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
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
-- Default password for all seed users: password123
INSERT INTO users (email, password_hash, full_name, role, status) VALUES
('shop1@b2bmarket.com', '$2b$10$s5xeeleYCNzElp0kOCgNuu3qpMk4lNNkca8UJ/NSElLxzugbV376C', 'ABC Retail Shop', 'shop', 'approved'),
('supplier1@b2bmarket.com', '$2b$10$s5xeeleYCNzElp0kOCgNuu3qpMk4lNNkca8UJ/NSElLxzugbV376C', 'XYZ Supplies Co.', 'supplier', 'approved'),
('admin@b2bmarket.com', '$2b$10$s5xeeleYCNzElp0kOCgNuu3qpMk4lNNkca8UJ/NSElLxzugbV376C', 'System Admin', 'admin', 'approved');

-- Seed data: Products (status 'active' = already approved by admin)
INSERT INTO products (supplier_id, name, description, price, stock, status, category, image_url) VALUES
(2, 'Premium Arabica Coffee Beans', 'High-quality Arabica beans from Vietnam highlands, medium roast', 24.99, 100, 'active', 'Coffee', 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=300&fit=crop'),
(2, 'Robusta Coffee Beans 1kg', 'Strong Robusta beans, dark roast, perfect for espresso', 18.50, 200, 'active', 'Coffee', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefda?w=400&h=300&fit=crop'),
(2, 'Green Tea Matcha Powder', 'Organic matcha powder from Japanese tea gardens', 32.00, 50, 'active', 'Tea', 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=400&h=300&fit=crop'),
(2, 'Ceramic Coffee Mug Set (4pcs)', 'Handcrafted ceramic mugs, microwave safe', 45.00, 30, 'active', 'Accessories', 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400&h=300&fit=crop'),
(2, 'Stainless Steel Coffee Filter', 'Vietnamese phin coffee filter, durable stainless steel', 12.99, 150, 'active', 'Accessories', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop'),
(2, 'Organic Honey 500ml', 'Pure organic wildflower honey from central highlands', 15.75, 80, 'active', 'Condiments', 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&h=300&fit=crop');

-- Seed data: Sample RFQ
INSERT INTO rfqs (shop_id, supplier_id, product_id, quantity, note, status) VALUES
(1, 2, 1, 50, 'Need bulk order for our new branch opening', 'quoted');

-- Seed data: Sample Quote
INSERT INTO quotes (rfq_id, supplier_id, unit_price, moq, delivery_days, note, status) VALUES
(1, 2, 22.00, 10, 5, 'Bulk discount applied. Free shipping on 50+ units.', 'pending');
