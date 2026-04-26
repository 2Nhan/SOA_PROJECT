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
- [Security Features](#security-features)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Local Development](#local-development)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)

---

## Project Overview

The system models a B2B marketplace with **three roles**:
- **Shop** (buyer) — browse products, send RFQs, review quotes, manage contracts, place orders
- **Supplier** (seller) — manage inventory, upload product images, respond to RFQs with quotes, confirm contracts/orders, process payments
- **Admin** (system controller) — approve/reject new users and products, monitor all RFQs, contracts, and system activity

The full B2B procurement flow is: **RFQ → Quote → Contract → Order → Payment**, following real-world B2B purchasing processes. The application is built using a **Database-per-Service** architecture, split into three independently deployable microservices:
- **Auth Service** (Centralized identity and session management)
- **Shop Service** (Buyer operations)
- **Supplier Service** (Seller and admin operations)

Each runs in its own Docker container and connects to its own dedicated database schema. Inter-service communication is handled via internal REST APIs using the API Composition pattern.

Key design decisions:
- Three-role system (Shop, Supplier, Admin) with approval workflows
- End-to-end RFQ → Quote → Contract → Order → Payment flow
- Saga pattern for distributed transaction management with compensating actions
- Admin approval gates for new users and product listings
- S3-based image storage for product photos
- Security hardening with Helmet, CORS, rate limiting, and input validation
- Graceful shutdown for zero-downtime deployments
- Infrastructure-as-code approach for reproducible deployments
- Blue/green deployment strategy via CodeDeploy

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
               +--------v--+  +--v-----------+  +--v-----------+
               | ECS Task   |  | ECS Task      |  | ECS Task      |
               | Shop       |  | Supplier      |  | Auth          |
               | Service    |  | Service       |  | Service       |
               | Port 8080  |  | Port 8080     |  | Port 8082     |
               +--------+--+  +--+-----------+  +--+-----------+
                        |        |                 |
                    +---v--------v-----------------v--+
                    | Amazon RDS                      |
                    | MySQL 8.0 (Database-per-service)|
                    | (auth_db, shop_db, supplier_db) |
                    +---------------+-----------------+
                                    |
                             +-------------+
                             | Amazon S3   |
                             | (Images)    |
                             +-------------+

    +--------------------------------------------------+
    | CI/CD (No CodeBuild/CodePipeline - Learner Lab)   |
    | ECR Image Push --> CLI CodeDeploy --> ECS Blue/Green|
    +--------------------------------------------------+

    +--------------------------------------------------+
    | Monitoring                                        |
    | CloudWatch Logs: /ecs/shop, /ecs/supplier         |
    +--------------------------------------------------+
```

Traffic routing is handled by a single Application Load Balancer with path-based rules:
- All requests to `/admin/*` are forwarded to the Supplier service (port 8080)
- Auth service is accessible internally on port 8082 (Shop and Supplier call it for session/user data)
- All other requests are forwarded to the Shop service (port 8080)
- Health checks on `/health` ensure only healthy containers receive traffic

---

## Microservices

### Auth Service (Identity Layer)

Handles all user management, authentication, and session handling. Provides a centralized UI for login/registration and exposes internal REST APIs for other services to resolve user data.

| Responsibility | Description |
|---|---|
| Registration & Login | Unified UI for users to sign up and authenticate |
| Profile Management | Update name, email, change password |
| Inter-service API | Provides batch lookup (`/api/auth/users?ids=X,Y`) for API composition |
| Session Management | Centralized cookie-based session tracking |

### Shop Service (Buyer)

Handles the buyer-facing experience. Shops browse products, send RFQs to suppliers, review quotes, and create orders. It queries `shop_db` and aggregates data from Auth and Supplier via HTTP APIs.

| Responsibility | Description |
|---|---|
| Product browsing | View approved products (data via Supplier API) |
| RFQ management | Send Requests for Quotation and review quotes |
| Contract management | View contracts formed from accepted quotes |
| Order placement | Create orders with distributed stock validation (Saga pattern) |

### Supplier Service (Seller + Admin)

Handles seller operations and system administration. Suppliers manage inventory, respond to RFQs, and process payments. Maintains `supplier_db`.

| Responsibility | Description |
|---|---|
| Product management | Full CRUD with image upload to Amazon S3 |
| RFQ response | View incoming RFQs and submit quotes (price, MOQ, delivery) |
| Contract management | Confirm or cancel contracts formed from accepted quotes |
| Order management | View, confirm, or cancel incoming orders |
| Payment processing | Process payments for confirmed orders |
| **Admin: User approval** | Approve/reject new user registrations, delete users |
| **Admin: Product approval** | Approve/reject product listings before they go live |
| **Admin: System monitoring** | Dashboard with stats, view all RFQs and contracts |

All services are stateless at the container layer and share only the external MySQL instance/session store. Each service owns its schema and can be scaled, updated, or restarted independently.

---

## Saga Workflow and Failure Handling

The system implements the Saga pattern for managing distributed transactions across the order lifecycle. Each step has a corresponding compensating action that executes on failure.

### End-to-End B2B Procurement Flow

```
Step 1: SEND RFQ (Shop Service)
  |  Shop selects a product and sends RFQ with desired quantity
  |  RFQ status: pending
  v
Step 2: SUBMIT QUOTE (Supplier Service)
  |  Supplier reviews RFQ and submits quote (unit_price, MOQ, delivery_days)
  |  RFQ status: quoted
  |
  |  [No response] --> RFQ remains pending
  v
Step 3: ACCEPT/REJECT QUOTE (Shop Service)
  |  Shop reviews quote and accepts or rejects
  |  [Accept] --> Supplier transaction:
  |                Validate quote is pending
  |                Create contract record
  |                Update quote status: accepted
  |              Then update RFQ status: accepted in Shop
  |  [Reject] --> Update quote status: rejected, then RFQ status: rejected
  v
Step 4: CONFIRM CONTRACT (Supplier Service)
  |  Supplier confirms the contract
  |  Contract status: draft --> confirmed
  |
  |  [Cancel] --> Contract status: cancelled
  v
Step 5: CREATE ORDER FROM CONTRACT (Shop Service)
  |  Shop creates order linked to the contract
  |  Saga:
  |    Validate and deduct stock in Supplier
  |    Insert order record in Shop (status: pending)
  |
  |  [Order insert failure] --> Compensating action: restore stock
  v
Step 6: CONFIRM ORDER (Supplier Service)
  |  Supplier reviews and confirms the order
  |  Update order status: pending --> confirmed
  |
  |  [Reject] --> CANCEL ORDER (compensating transaction)
  |               Restore stock to product
  v
Step 7: PROCESS PAYMENT (Supplier Service)
  |  Validate payment method (bank_transfer, qr_code, cod)
  |  Insert payment record (status: pending)
  |  Update order status: confirmed --> paid
  |  Mark payment status: success
  |
  |  [Payment finalize failure] --> Mark payment failed; order status is not changed
  v
Step 8: ORDER COMPLETE
  Final state: order.status = 'paid', payment recorded
```

### Failure Scenarios Handled

| Scenario | Trigger | Compensating Action |
|---|---|---|
| Insufficient stock | Order quantity > available stock | Order rejected, no changes made |
| Product not found | Product deleted or inactive | Order rejected with error message |
| Order cancelled (pending) | Supplier cancels pending order | Stock restored to original level |
| Order cancelled (confirmed) | Supplier cancels confirmed order | Stock restored to original level |
| Payment finalize failure | Shop status update or local payment update fails | Payment marked failed; order remains unchanged for retry |
| Invalid payment method | Method not in whitelist | Request rejected with validation error |

---

## CI/CD Pipeline

The project uses AWS developer tools to implement a continuous deployment pipeline. **CodeBuild is not available in AWS Academy Learner Lab**, so Docker images are built and pushed to ECR manually from Cloud9. The pipeline is triggered automatically when a new image is pushed to ECR.

### Pipeline Stages

```
Stage 1: MANUAL BUILD (Cloud9 / Local)
  Developer builds Docker image and pushes to Amazon ECR
  Trigger: Manual docker push to ECR repository
      |
      v
Stage 2: DEPLOY (CLI → CodeDeploy → ECS Blue/Green)
  Trigger: Manual CLI command (aws deploy create-deployment)
  Strategy: Blue/Green deployment
  Process:
    1. Register new ECS task definition with updated image URI
    2. Create new task set (green) in standby target group
    3. Health check passes → ALB traffic switches to new tasks
    4. Old task set (blue) terminated after 5 minutes
  Config: appspec-*.yaml + taskdef-*.json in deployment/
```

> **Why no CodeBuild or CodePipeline?** AWS Academy Learner Lab does not include CodeBuild or CodePipeline in its allowed services. Images are built on Cloud9 and pushed directly to ECR. CodeDeploy blue/green deployments are triggered manually via AWS CLI.

### Pipeline Configuration Files

| File | Purpose |
|---|---|
| `deployment/appspec-shop.yaml` | CodeDeploy ECS deployment spec for Shop |
| `deployment/appspec-supplier.yaml` | CodeDeploy ECS deployment spec for Supplier |
| `deployment/taskdef-shop.json` | ECS task definition for Shop (image placeholder: `<IMAGE1_NAME>`) |
| `deployment/taskdef-supplier.json` | ECS task definition for Supplier (image placeholder: `<IMAGE1_NAME>`) |
| `deployment/create-shop-microservice-tg-two.json` | ECS service config with CODE_DEPLOY controller |
| `deployment/create-supplier-microservice-tg-two.json` | ECS service config with CODE_DEPLOY controller |

### Build and Deploy Workflow

```bash
# 1. Build Docker image from project root (shared/ folder must be in context)
docker build -t shop -f ./microservices/shop/docker/Dockerfile .

# 2. Tag and push to ECR
account_id=$(aws sts get-caller-identity --query Account --output text)
docker tag shop:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest

# 3. Trigger CodeDeploy blue/green deployment via CLI
aws deploy create-deployment \
  --application-name b2b-marketplace \
  --deployment-group-name shop-deployment-group \
  --revision '{"revisionType":"AppSpecContent","appSpecContent":{"content":"{...}"}}'
```

---

## AWS Infrastructure

### Services Used

| AWS Service | Purpose | Configuration |
|---|---|---|
| Amazon ECS (Fargate) | Container orchestration | 3 services (auth, shop, supplier), 1 task each, 0.25 vCPU / 512MB RAM |
| Amazon ECR | Docker image registry | 3 private repositories (auth, shop, supplier) |
| Application Load Balancer | Traffic routing & health checks | Path-based routing (`/admin/*` → Supplier, default → Shop), 4 target groups for blue/green |
| Amazon RDS (MySQL 8.0) | Managed database | db.c6gd.medium, Single-AZ, 20GB gp3 |
| Amazon S3 | Product image storage | Public-read bucket for supplier product photos |
| AWS Cloud9 | Development environment | t3.small, Amazon Linux 2, for Docker builds and ECR pushes |
| AWS CodeCommit | Source code repository | Stores project code, main branch |
| AWS CodeDeploy | ECS blue/green deployments | 2 deployment groups, 4 target groups, auto-rollback on failure |
| ~~AWS CodePipeline~~ | ~~Pipeline orchestration~~ | Not available in Learner Lab — CodeDeploy triggered via CLI |
| Amazon CloudWatch | Logging and monitoring | Log groups: `/ecs/shop`, `/ecs/supplier`, CPU/memory alarms |

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
| ECS Task Role | `LabRole` | Runtime permissions: access RDS, S3, CloudWatch |
| ~~CodeBuild Service Role~~ | ~~`LabRole`~~ | ~~Not available in Learner Lab~~ |
| CodeDeploy Service Role | `LabRole` | Manage ECS deployments, ALB target groups |
| ~~CodePipeline Service Role~~ | ~~`LabRole`~~ | ~~Not available in Learner Lab~~ |
| RDS Management | `LabRole` | Database instance management |

### Permission Boundaries

The `LabRole` provides broad permissions across supported AWS services but operates within Learner Lab restrictions:
- Region limited to `us-east-1` and `us-west-2`
- Instance types limited to nano, micro, small, medium, and large
- Cannot create IAM users, groups, or custom roles
- Cannot enable RDS enhanced monitoring
- Maximum 9 concurrent EC2 instances

---

## Security Features

The application implements multiple layers of security:

| Layer | Implementation | Description |
|---|---|---|
| Authentication | `bcryptjs` + `express-session` | Password hashing (10 salt rounds), session-based login, role-based access control |
| Auth Middleware | `requireAuth`, `requireShop`, `requireSupplier`, `requireAdmin` | Web routes are role-protected; unauthenticated users redirect to service-specific login (`/login` for Shop, `/admin/login` for Supplier); admin routes require admin role |
| HTTP Headers | `helmet` | Sets security headers: X-XSS-Protection, X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options |
| CORS | `cors` | Configurable origin restriction via `ALLOWED_ORIGINS` env var |
| Rate Limiting | `express-rate-limit` | Global: 200 req/15min per IP. Write operations: 10-20 req/min per IP |
| Input Validation | Custom middleware | All params parsed and validated (type, range, length). NaN/injection checks |
| XSS Prevention | HTML tag stripping | All text inputs sanitized with regex `/<[^>]*>/g` removal |
| Payload Limits | Express body-parser | Request body capped at 1MB (10MB for image uploads) |
| File Validation | `multer` | Image uploads: 5MB max, JPEG/PNG/GIF/WebP only |
| Trust Proxy | Express config | Correct client IP behind ALB for rate limiting |
| Error Handling | Global middleware | Production: generic messages. Development: stack traces |

---

## Database Schema (Database-per-Service)

The application uses three isolated databases:

**1. `auth_db` (Identity Service)**
```sql
users          -- Registered accounts
  id           INT PRIMARY KEY AUTO_INCREMENT
  email        VARCHAR(255) UNIQUE
  password_hash VARCHAR(255)
  full_name    VARCHAR(255)
  role         ENUM('shop', 'supplier', 'admin')
  status       ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'
```

**2. `supplier_db` (Catalog & Financial Service)**
```sql
products       -- Product catalog (requires admin approval)
  id           INT PRIMARY KEY AUTO_INCREMENT
  supplier_id  INT FOREIGN KEY -> users.id
  name         VARCHAR(255)
  description  TEXT
  price        DECIMAL(12,2)
  stock        INT
  status       ENUM('active', 'inactive', 'pending') DEFAULT 'pending'
  image_url    VARCHAR(500)
  category     VARCHAR(100)

quotes         -- Supplier responses to RFQs
  id           INT PRIMARY KEY AUTO_INCREMENT
  rfq_id       INT logical reference -> shop_db.rfqs.id
  supplier_id  INT logical reference -> auth_db.users.id
  unit_price   DECIMAL(12,2)
  moq          INT                   -- Minimum order quantity
  delivery_days INT
  note         TEXT
  status       ENUM('pending', 'accepted', 'rejected')
```

**3. `shop_db` (Procurement Service)**
```sql
rfqs           -- Request for Quotation from shops
  id           INT PRIMARY KEY AUTO_INCREMENT
  shop_id      INT FOREIGN KEY -> users.id
  supplier_id  INT FOREIGN KEY -> users.id
  product_id   INT FOREIGN KEY -> products.id
  quantity     INT
  note         TEXT
  status       ENUM('pending', 'quoted', 'accepted', 'rejected', 'expired')
```

**Back inside `supplier_db`**:
```sql
contracts      -- Agreements formed from accepted quotes
  id           INT PRIMARY KEY AUTO_INCREMENT
  quote_id     INT FOREIGN KEY -> quotes.id
  shop_id      INT logical reference -> auth_db.users.id
  supplier_id  INT logical reference -> auth_db.users.id
  product_id   INT FOREIGN KEY -> products.id
  quantity     INT
  unit_price   DECIMAL(12,2)
  total_amount DECIMAL(12,2)
  delivery_days INT
  status       ENUM('draft', 'confirmed', 'completed', 'cancelled')

```

**Back inside `shop_db`**:
```sql
orders         -- Purchase orders (linked to contracts)
  id           INT PRIMARY KEY AUTO_INCREMENT
  shop_id      INT logical reference -> auth_db.users.id
  product_id   INT logical reference -> supplier_db.products.id
  contract_id  INT logical reference -> supplier_db.contracts.id (nullable)
  quantity     INT
  total_price  DECIMAL(12,2)
  status       ENUM('pending', 'confirmed', 'paid', 'cancelled', 'delivering', 'delivered')
  note         TEXT

```

**Back inside `supplier_db`**:
```sql
payments       -- Payment records for confirmed orders
  id           INT PRIMARY KEY AUTO_INCREMENT
  order_id     INT logical reference -> shop_db.orders.id
  amount       DECIMAL(12,2)
  method       ENUM('bank_transfer', 'qr_code', 'cod')
  status       ENUM('pending', 'success', 'failed')
```

---

## API Endpoints

### Shop Service (port 8080)

| Method | Path | Description |
|---|---|---|
| GET | `/login` | Login page |
| POST | `/login` | Authenticate user (shop role only) |
| GET | `/register` | Registration page |
| POST | `/register` | Create new shop account (pending approval) |
| GET | `/logout` | Logout and destroy session |
| GET | `/profile` | View/edit profile and change password |
| POST | `/profile` | Update profile (name, email) |
| POST | `/profile/password` | Change password |
| GET | `/` | Home page |
| GET | `/health` | Health check |
| GET | `/products` | List all approved products (supports `?search=`) |
| GET | `/products/:id` | Product detail with "Send RFQ" button |
| GET | `/rfqs` | List shop's RFQs with quote status |
| GET | `/rfqs/new/:productId` | RFQ creation form |
| POST | `/rfqs` | Submit new RFQ |
| GET | `/rfqs/:id` | RFQ detail with quotes and accept/reject |
| POST | `/rfqs/:id/accept/:quoteId` | Accept a quote → create contract |
| POST | `/rfqs/:id/reject/:quoteId` | Reject a quote |
| GET | `/contracts` | List shop's contracts |
| GET | `/contracts/:id` | Contract detail |
| POST | `/contracts/:id/order` | Create order from confirmed contract |
| GET | `/orders` | List orders for current shop |
| GET | `/orders/new/:productId` | Order creation form (direct) |
| POST | `/orders` | Submit new order |
| GET | `/orders/:id` | Order detail page |

### Supplier Service (port 8080)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/admin/login` | Login page |
| POST | `/admin/login` | Authenticate user (supplier/admin roles only) |
| GET | `/admin/register` | Registration page |
| POST | `/admin/register` | Create new supplier account (pending approval) |
| GET | `/admin/logout` | Logout and destroy session |
| GET | `/admin/profile` | View/edit profile and change password |
| POST | `/admin/profile` | Update profile (name, email) |
| POST | `/admin/profile/password` | Change password |
| GET | `/admin/` | Supplier dashboard |
| GET | `/admin/products` | List all products with images |
| GET | `/admin/products/add` | Add product form |
| POST | `/admin/products` | Create product + upload image to S3 |
| GET | `/admin/products/edit/:id` | Edit product form |
| POST | `/admin/products/update/:id` | Update product + replace image on S3 |
| POST | `/admin/products/delete/:id` | Delete product + remove image from S3 |
| GET | `/admin/rfqs` | List supplier's incoming RFQs |
| GET | `/admin/rfqs/:id` | RFQ detail with quote form |
| POST | `/admin/rfqs/:id/quote` | Submit quote for an RFQ |
| GET | `/admin/contracts` | List supplier's contracts |
| GET | `/admin/contracts/:id` | Contract detail |
| POST | `/admin/contracts/:id/confirm` | Confirm contract |
| POST | `/admin/contracts/:id/cancel` | Cancel contract |
| GET | `/admin/orders` | List all orders |
| GET | `/admin/orders/:id` | Order detail with actions |
| POST | `/admin/orders/:id/confirm` | Confirm order |
| POST | `/admin/orders/:id/cancel` | Cancel order + restore stock |
| GET | `/admin/orders/:id/payment` | Payment form |
| POST | `/admin/orders/:id/payment` | Process payment |
| GET | `/admin/manage` | Admin dashboard (stats) |
| GET | `/admin/manage/users` | User management (approve/reject/delete) |
| POST | `/admin/manage/users/:id/approve` | Approve user |
| POST | `/admin/manage/users/:id/reject` | Reject user |
| POST | `/admin/manage/users/:id/delete` | Delete user |
| GET | `/admin/manage/products` | Product approval list |
| POST | `/admin/manage/products/:id/approve` | Approve product |
| POST | `/admin/manage/products/:id/reject` | Reject product |
| POST | `/admin/manage/products/:id/delete` | Delete product |
| GET | `/admin/manage/rfqs` | All RFQs (read-only) |
| GET | `/admin/manage/contracts` | All contracts (read-only) |

---

## Local Development

### Prerequisites

- Docker and Docker Compose installed
- No AWS account required for local testing (S3 uploads will fail locally but URL images from seed data will work)

### Running Locally

```bash
# Create local secrets first. Change the example values before using a shared machine.
cp .env.example .env

# Start all services (MySQL + Shop + Supplier)
docker-compose up --build

# Shop service:    http://localhost:8080
# Supplier panel:  http://localhost:8081/admin/
```

The databases are automatically initialized with `deployment/00-create-user.sh`, `deployment/auth_db_init.sql`, `deployment/supplier_db_init.sql`, and `deployment/shop_db_init.sql`.

### Demo Credentials

| Email | Password | Role | Service |
|---|---|---|---|
| `shop1@b2bmarket.com` | `password123` | Shop | Shop (`/login`) |
| `supplier1@b2bmarket.com` | `password123` | Supplier | Supplier (`/admin/login`) |
| `admin@b2bmarket.com` | `password123` | Admin | Supplier (`/admin/login`) |

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
├── CONTRIBUTING.md                       # Developer guidelines & conventions
├── docs/
│   └── api-specs/
│       └── b2b-marketplace-api.yaml      # OpenAPI documentation for REST APIs
├── deployment/
│   ├── auth_db_init.sql                  # Auth database schema + seed
│   ├── supplier_db_init.sql              # Supplier database schema + seed
│   ├── shop_db_init.sql                  # Shop database schema + seed
│   ├── appspec-shop.yaml                 # CodeDeploy spec
│   ├── appspec-supplier.yaml             
│   ├── appspec-auth.yaml             
│   ├── taskdef-shop.json                 
│   ├── taskdef-supplier.json             
│   ├── taskdef-auth.json             
│   └── ...
├── shared/                               # DRY package: Reused code across all services
│   ├── clients/                          # HTTP integrations (auth.client.js, shop.client.js, supplier.client.js)
│   ├── config/                           # Standard DB pool setup
│   └── middlewares/                      # Auth guards, API key protection, JSON-aware error handling
└── microservices/
    ├── auth/                             # Auth Identity Microservice
    │   ├── package.json
    │   ├── index.js                      # Lightweight Express Bootstrapper
    │   ├── docker/                       # Dockerfile for build context
    │   ├── src/                          # Auth Domain Logic
    │   │   ├── config/                   # Local db configuration overrides
    │   │   ├── api/                      # REST API (JSON) serving Machine-to-Machine
    │   │   ├── controllers/              # Web UI serving EJS templates
    │   │   └── routes/                   # auth.routes.js mapping logic
    │   └── views/
    ├── shop/                             # Shop (Buyer) Microservice
    │   ├── package.json
    │   ├── index.js                      # Lightweight Express Bootstrapper
    │   ├── docker/
    │   ├── src/
    │   │   ├── config/
    │   │   ├── api/                      # JSON APIs logic (Order states, RFQs)
    │   │   ├── clients/                  # HTTP calls to Supplier & Auth
    │   │   ├── controllers/              # Web UI Controllers
    │   │   ├── models/                   # Local database abstractions
    │   │   └── routes/
    │   └── views/
    └── supplier/                         # Supplier + Admin Microservice
        ├── package.json
        ├── index.js                      # Lightweight Express Bootstrapper
        ├── docker/
        ├── src/
        │   ├── config/                   # S3 Config, Local DB config
        │   ├── api/                      # JSON APIs Logic (Product fetches, Quotes)
        │   ├── clients/                  # HTTP calls to Shop & Auth
        │   ├── controllers/              # Web views for Dashboard, Admin users
        │   ├── models/                   # Local database abstractions
        │   └── routes/
        └── views/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (Alpine) |
| Framework | Express.js 4.x |
| Template Engine | EJS with Bootstrap 5 |
| Database | MySQL 8.0 (via mysql2 connection pool) |
| Image Storage | Amazon S3 (via @aws-sdk/client-s3) |
| File Upload | Multer (memory storage, 5MB limit) |
| Authentication | bcryptjs (password hashing), express-session (sessions) |
| Security | Helmet, CORS, express-rate-limit, input validation |
| Performance | Compression (gzip), Morgan (logging) |
| Containerization | Docker |
| Orchestration | Amazon ECS on Fargate |
| Load Balancing | AWS Application Load Balancer |
| CI/CD | AWS CodeDeploy (Blue/Green via CLI, no CodeBuild/CodePipeline) |
| Image Registry | Amazon ECR |
| Database Hosting | Amazon RDS |
| Monitoring | Amazon CloudWatch Logs |

---

## Authors

SOA Group Project - Service-Oriented Architecture Course
