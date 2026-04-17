# B2B Marketplace - Microservices on AWS

A microservices-based B2B marketplace system deployed on AWS using containerized services, automated CI/CD pipelines, and managed cloud infrastructure. Built as part of the Service-Oriented Architecture course project.

---

## Table of Contents

- [Project Overview](#project-overview)
- [System Architecture](#system-architecture)
- [Microservices](#microservices)
- [Saga Workflow and Failure Handling](#saga-workflow-and-failure-handling)
- [CI/CD Pipeline](#cicd-pipeline)
- [AWS Infrastructure](#aws-infrastructure)
- [IAM Roles and Permissions](#iam-roles-and-permissions)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Local Development](#local-development)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)

---

## Project Overview

The system models a B2B marketplace where **shops** (buyers) browse products and place orders, while **suppliers** (sellers) manage inventory, confirm orders, and process payments. The application is split into two independently deployable microservices, each running in its own Docker container on AWS ECS Fargate.

Key design decisions:
- Separation of concerns between buyer-facing and seller-facing operations
- Saga pattern for distributed transaction management with compensating actions
- Infrastructure-as-code approach for reproducible deployments
- Blue/green deployment strategy for zero-downtime updates

---

## System Architecture

```
                          Internet
                             |
                    +--------v--------+
                    | Application     |
                    | Load Balancer   |
                    | (HTTP:80)       |
                    +---+--------+----+
                        |        |
              Path: /*  |        | Path: /admin/*
                        |        |
               +--------v--+  +--v-----------+
               | ECS Task   |  | ECS Task      |
               | Shop       |  | Supplier      |
               | Service    |  | Service       |
               | (Fargate)  |  | (Fargate)     |
               | Port 8080  |  | Port 8080     |
               +--------+--+  +--+-----------+
                        |        |
                    +---v--------v----+
                    | Amazon RDS      |
                    | MySQL 8.0       |
                    | (db.t3.micro)   |
                    +-----------------+

    +--------------------------------------------------+
    | CI/CD Pipeline                                    |
    | CodeCommit --> CodeBuild --> CodeDeploy --> ECS    |
    +--------------------------------------------------+

    +--------------------------------------------------+
    | Monitoring                                        |
    | CloudWatch Logs: /ecs/shop, /ecs/supplier         |
    +--------------------------------------------------+
```

Traffic routing is handled by a single Application Load Balancer with path-based rules:
- All requests to `/admin/*` are forwarded to the Supplier service
- All other requests are forwarded to the Shop service
- Health checks on `/health` ensure only healthy containers receive traffic

---

## Microservices

### Shop Service (Customer/Buyer)

Handles the buyer-facing experience. Customers can browse the product catalog, search for items, and place orders.

| Responsibility | Description |
|---|---|
| Product browsing | View all active products with search and filtering |
| Product details | View individual product information, stock levels, supplier |
| Order placement | Create orders with stock validation and reservation |
| Order tracking | View order history and current status |

### Supplier Service (Admin/Seller)

Handles the seller-facing operations. Suppliers manage their product inventory, process incoming orders, and handle payments.

| Responsibility | Description |
|---|---|
| Product management | Full CRUD operations on product listings |
| Order management | View, confirm, or cancel incoming orders |
| Payment processing | Process payments for confirmed orders |
| Stock management | Automatic stock adjustment on order/cancel/payment events |

Both services are stateless and connect to a shared MySQL database. Each service runs independently in its own container and can be scaled, updated, or restarted without affecting the other.

---

## Saga Workflow and Failure Handling

The system implements the Saga pattern for managing distributed transactions across the order lifecycle. Each step has a corresponding compensating action that executes on failure.

### End-to-End Order Flow

```
Step 1: CREATE ORDER (Shop Service)
  |  Validate product exists and is active
  |  Check stock availability
  |  BEGIN TRANSACTION
  |    Insert order record (status: pending)
  |    Deduct stock from product
  |  COMMIT
  |
  |  [Failure] --> Rollback: no order created, stock unchanged
  v
Step 2: CONFIRM ORDER (Supplier Service)
  |  Supplier reviews and confirms the order
  |  Update order status: pending --> confirmed
  |
  |  [Reject] --> CANCEL ORDER (compensating transaction)
  |               BEGIN TRANSACTION
  |                 Update order status --> cancelled
  |                 Restore stock to product
  |               COMMIT
  v
Step 3: PROCESS PAYMENT (Supplier Service)
  |  Verify order is in confirmed status
  |  BEGIN TRANSACTION
  |    Insert payment record (status: success)
  |    Update order status: confirmed --> paid
  |  COMMIT
  |
  |  [Payment Failure] --> COMPENSATING TRANSACTION
  |                        Cancel order (status --> cancelled)
  |                        Restore stock to product
  |                        Record failure reason
  v
Step 4: ORDER COMPLETE
  Final state: order.status = 'paid', payment recorded
```

### Failure Scenarios Handled

| Scenario | Trigger | Compensating Action |
|---|---|---|
| Insufficient stock | Order quantity > available stock | Order rejected, no changes made |
| Product not found | Product deleted or inactive | Order rejected with error message |
| Order cancelled (pending) | Supplier cancels pending order | Stock restored to original level |
| Order cancelled (confirmed) | Supplier cancels confirmed order | Stock restored to original level |
| Payment failure | Database error during payment | Order cancelled + stock restored |

---

## CI/CD Pipeline

The project uses AWS developer tools to implement a continuous integration and continuous deployment pipeline.

### Pipeline Stages

```
Stage 1: SOURCE
  Trigger: Code push to CodeCommit repository (main branch)
  Output: Source code artifact
      |
      v
Stage 2: BUILD (CodeBuild)
  Environment: Amazon Linux 2, Docker runtime
  Process:
    1. Authenticate to Amazon ECR
    2. Build Docker image from Dockerfile
    3. Tag image with commit hash
    4. Push image to ECR repository
    5. Generate image definitions artifact
  Config: buildspec.yml in each microservice directory
      |
      v
Stage 3: DEPLOY (CodeDeploy to ECS)
  Strategy: Blue/Green deployment
  Process:
    1. Register new ECS task definition with updated image
    2. Create new task set (green) in ECS service
    3. Route ALB traffic to new task set
    4. Terminate old task set (blue)
  Config: appspec-*.yaml + taskdef-*.json in deployment/
```

### Pipeline Configuration Files

| File | Purpose |
|---|---|
| `microservices/shop/buildspec.yml` | CodeBuild instructions for Shop service |
| `microservices/supplier/buildspec.yml` | CodeBuild instructions for Supplier service |
| `deployment/appspec-shop.yaml` | CodeDeploy ECS deployment spec for Shop |
| `deployment/appspec-supplier.yaml` | CodeDeploy ECS deployment spec for Supplier |
| `deployment/taskdef-shop.json` | ECS task definition for Shop |
| `deployment/taskdef-supplier.json` | ECS task definition for Supplier |

### Required Environment Variables in CodeBuild

| Variable | Description |
|---|---|
| `AWS_ACCOUNT_ID` | AWS account ID for ECR URI construction |
| `AWS_DEFAULT_REGION` | Deployment region (us-east-1) |

---

## AWS Infrastructure

### Services Used

| AWS Service | Purpose | Configuration |
|---|---|---|
| Amazon ECS (Fargate) | Container orchestration | 2 services, 1 task each, 0.25 vCPU / 512MB |
| Amazon ECR | Docker image registry | 2 repositories (shop, supplier) |
| Application Load Balancer | Traffic routing and health checks | Path-based routing, health check on /health |
| Amazon RDS | Managed MySQL database | db.t3.micro, MySQL 8.0, Single-AZ, 20GB gp2 |
| AWS CodeCommit | Source code repository | Main branch triggers pipeline |
| AWS CodeBuild | Docker image builds | Managed build environment with Docker |
| AWS CodeDeploy | ECS blue/green deployments | Automated traffic shifting |
| AWS CodePipeline | Pipeline orchestration | Source -> Build -> Deploy |
| Amazon CloudWatch | Logging and monitoring | Log groups: /ecs/shop, /ecs/supplier |

### Network Configuration

- VPC with public subnets (no NAT Gateway to reduce cost)
- ECS tasks use `assignPublicIp: ENABLED` for ECR image pulls
- Security groups restrict RDS access to ECS tasks only
- ALB is internet-facing on port 80

---

## IAM Roles and Permissions

The project uses the pre-configured `LabRole` provided by AWS Academy Learner Lab. This role is assigned to multiple service contexts.

### Role Assignments

| Context | Role | Purpose |
|---|---|---|
| ECS Task Execution Role | `LabRole` | Pull images from ECR, push logs to CloudWatch |
| ECS Task Role | `LabRole` | Runtime permissions for containers to access AWS services |
| CodeBuild Service Role | `LabRole` | Access ECR, S3, CloudWatch during builds |
| CodeDeploy Service Role | `LabRole` | Manage ECS deployments, ALB target groups |
| CodePipeline Service Role | `LabRole` | Orchestrate pipeline stages, access artifacts in S3 |
| RDS Management | `LabRole` | Database instance management |

### Permission Boundaries

The `LabRole` provides broad permissions across supported AWS services but operates within Learner Lab restrictions:
- Region limited to `us-east-1` and `us-west-2`
- Instance types limited to nano, micro, small, medium, and large
- Cannot create IAM users, groups, or custom roles
- Cannot enable RDS enhanced monitoring
- Maximum 9 concurrent EC2 instances

---

## Database Schema

```sql
users          -- Registered accounts (shops and suppliers)
  id           INT PRIMARY KEY AUTO_INCREMENT
  email        VARCHAR(255) UNIQUE
  full_name    VARCHAR(255)
  role         ENUM('shop', 'supplier', 'admin')

products       -- Product catalog managed by suppliers
  id           INT PRIMARY KEY AUTO_INCREMENT
  supplier_id  INT FOREIGN KEY -> users.id
  name         VARCHAR(255)
  description  TEXT
  price        DECIMAL(12,2)
  stock        INT
  status       ENUM('active', 'inactive', 'pending')
  category     VARCHAR(100)

orders         -- Purchase orders created by shops
  id           INT PRIMARY KEY AUTO_INCREMENT
  shop_id      INT FOREIGN KEY -> users.id
  product_id   INT FOREIGN KEY -> products.id
  quantity     INT
  total_price  DECIMAL(12,2)
  status       ENUM('pending', 'confirmed', 'paid', 'cancelled')
  note         TEXT

payments       -- Payment records for confirmed orders
  id           INT PRIMARY KEY AUTO_INCREMENT
  order_id     INT FOREIGN KEY -> orders.id
  amount       DECIMAL(12,2)
  method       ENUM('bank_transfer', 'qr_code', 'cod')
  status       ENUM('pending', 'success', 'failed')
```

---

## API Endpoints

### Shop Service (port 8080)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Home page |
| GET | `/health` | Health check for ALB |
| GET | `/products` | List all active products (supports `?search=keyword`) |
| GET | `/products/:id` | Product detail page |
| GET | `/orders` | List orders for current shop |
| GET | `/orders/new/:productId` | Order creation form |
| POST | `/orders` | Submit new order |
| GET | `/orders/:id` | Order detail page |

### Supplier Service (port 8080)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check for ALB |
| GET | `/admin/` | Supplier dashboard |
| GET | `/admin/products` | List all products |
| GET | `/admin/products/add` | Add product form |
| POST | `/admin/products` | Create new product |
| GET | `/admin/products/edit/:id` | Edit product form |
| POST | `/admin/products/update/:id` | Update product |
| POST | `/admin/products/delete/:id` | Delete product |
| GET | `/admin/orders` | List all orders |
| GET | `/admin/orders/:id` | Order detail with actions |
| POST | `/admin/orders/:id/confirm` | Confirm pending order |
| POST | `/admin/orders/:id/cancel` | Cancel order (restores stock) |
| GET | `/admin/orders/:id/payment` | Payment form |
| POST | `/admin/orders/:id/payment` | Process payment |

---

## Local Development

### Prerequisites

- Docker and Docker Compose installed
- No AWS account required for local testing

### Running Locally

```bash
# Start all services (MySQL + Shop + Supplier)
docker-compose up --build

# Shop service:    http://localhost:8080
# Supplier panel:  http://localhost:8081/admin/
```

The database is automatically initialized with schema and seed data from `deployment/db-init.sql`.

### Stopping

```bash
docker-compose down          # Stop services, keep data
docker-compose down -v       # Stop services, delete database volume
```

---

## Project Structure

```
.
├── GUIDE.md                              # Deployment guide and budget management
├── README.md                             # This file
├── docker-compose.yml                    # Local development environment
├── deployment/
│   ├── db-init.sql                       # Database schema and seed data
│   ├── appspec-shop.yaml                 # CodeDeploy spec for Shop
│   ├── appspec-supplier.yaml             # CodeDeploy spec for Supplier
│   ├── taskdef-shop.json                 # ECS task definition for Shop
│   ├── taskdef-supplier.json             # ECS task definition for Supplier
│   ├── create-shop-microservice-tg-two.json
│   └── create-supplier-microservice-tg-two.json
└── microservices/
    ├── shop/                             # Shop (Buyer) Microservice
    │   ├── Dockerfile
    │   ├── buildspec.yml                 # CodeBuild configuration
    │   ├── package.json
    │   ├── index.js                      # Express server + routes
    │   ├── app/
    │   │   ├── config/
    │   │   │   ├── config.js             # Database configuration
    │   │   │   └── db.js                 # Connection pool
    │   │   ├── controller/
    │   │   │   ├── product.controller.js
    │   │   │   └── order.controller.js
    │   │   └── models/
    │   │       ├── product.model.js
    │   │       └── order.model.js
    │   └── views/                        # EJS templates (Bootstrap 5)
    └── supplier/                         # Supplier (Admin) Microservice
        ├── Dockerfile
        ├── buildspec.yml
        ├── package.json
        ├── index.js
        ├── app/
        │   ├── config/
        │   │   ├── config.js
        │   │   └── db.js
        │   ├── controller/
        │   │   ├── product.controller.js
        │   │   ├── order.controller.js
        │   │   └── payment.controller.js
        │   └── models/
        │       ├── product.model.js
        │       ├── order.model.js
        │       └── payment.model.js
        └── views/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 (Alpine) |
| Framework | Express.js 4.x |
| Template Engine | EJS with Bootstrap 5 |
| Database | MySQL 8.0 (via mysql2 driver) |
| Containerization | Docker |
| Orchestration | Amazon ECS on Fargate |
| Load Balancing | AWS Application Load Balancer |
| CI/CD | AWS CodePipeline + CodeBuild + CodeDeploy |
| Image Registry | Amazon ECR |
| Database Hosting | Amazon RDS |
| Monitoring | Amazon CloudWatch Logs |

---

## Authors

SOA Group Project - Service-Oriented Architecture Course
