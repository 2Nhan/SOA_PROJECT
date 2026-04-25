-- Auth Database Schema
-- Database per Service: Auth owns the users table

CREATE DATABASE IF NOT EXISTS auth_db;
USE auth_db;

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

-- Seed data: Users
-- Default password for all seed users: password123
INSERT INTO users (email, password_hash, full_name, role, status) VALUES
('shop1@b2bmarket.com', '$2b$10$s5xeeleYCNzElp0kOCgNuu3qpMk4lNNkca8UJ/NSElLxzugbV376C', 'ABC Retail Shop', 'shop', 'approved'),
('supplier1@b2bmarket.com', '$2b$10$s5xeeleYCNzElp0kOCgNuu3qpMk4lNNkca8UJ/NSElLxzugbV376C', 'XYZ Supplies Co.', 'supplier', 'approved'),
('admin@b2bmarket.com', '$2b$10$s5xeeleYCNzElp0kOCgNuu3qpMk4lNNkca8UJ/NSElLxzugbV376C', 'System Admin', 'admin', 'approved');
