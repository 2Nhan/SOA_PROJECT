# B2B Marketplace - Deployment Guide & Budget Management

## Table of Contents
1. [System Trade-offs & Gaps](#1-system-trade-offs--gaps)
2. [Security Features Implemented](#2-security-features-implemented)
3. [AWS Deployment Step-by-Step](#3-aws-deployment-step-by-step)
4. [Budget Management ($50 Learner Lab)](#4-budget-management-50-learner-lab)
5. [Demo Script (Saga Workflow)](#5-demo-script-saga-workflow)
6. [Daily Checklist](#6-daily-checklist)

---

## 1. System Trade-offs & Gaps

### Current Architecture Trade-offs

| Trade-off | Current Choice | Why | Impact |
|---|---|---|---|
| **Shared Database** | Both services use same RDS MySQL | Simpler setup, saves budget (1 RDS instead of 2) | Not ideal microservices pattern, but acceptable for this project scope |
| **No Authentication** | Hardcoded `shop_id: 1` | Keeps project focused on microservices + AWS, not auth | Mention in report as simplification |
| **Synchronous Communication** | Services share DB directly, no message queue | SQS/SNS would add complexity and cost | For 2 services this is fine; note in report that async (SQS) would be better at scale |
| **No API Gateway** | ALB routes directly to services | API Gateway costs extra and adds complexity | ALB path-based routing is sufficient for 2 services |
| **Single AZ deployment** | One subnet for cost savings | Multi-AZ doubles RDS cost | Acceptable for demo; mention Multi-AZ for production |
| **EJS server-side rendering** | No separate frontend service | Keeps it simple, fewer containers = less cost | Good for demo purposes |

### Gaps Already Addressed

| Gap | Status | How |
|---|---|---|
| Input sanitization/validation | FIXED | HTML tag stripping, type/range validation on all inputs |
| Rate limiting | FIXED | 200 req/15min global, 10-20 req/min for write ops |
| XSS prevention | FIXED | Helmet security headers + HTML tag stripping |
| Connection management | FIXED | MySQL connection pools instead of single connections |
| Graceful shutdown | FIXED | SIGTERM/SIGINT handlers for zero-downtime ECS deploys |
| Product images | FIXED | S3 upload with multer (5MB, JPEG/PNG/GIF/WebP) |
| Error handling | FIXED | Global error middleware, 404 handler |
| Health checks | FIXED | `/health` endpoint for ALB |

### What NOT to Add (Out of Scope / Budget Risk)

- **Amazon SQS/SNS** - adds cost, not required
- **Amazon API Gateway** - $3.50/million requests, ALB is enough
- **ElastiCache/Redis** - unnecessary for this scale
- **Multi-AZ RDS** - doubles DB cost
- **NAT Gateway** - ~$0.045/hr ($32/month!) - use public subnets instead
- **Multiple environments (dev/staging/prod)** - one environment is enough
- **Amazon Cognito** - auth is not the focus

---

## 2. Security Features Implemented

| Layer | Package | Description |
|---|---|---|
| HTTP Headers | `helmet` | X-XSS-Protection, X-Content-Type-Options, X-Frame-Options, HSTS |
| CORS | `cors` | Configurable origin restriction via `ALLOWED_ORIGINS` env var |
| Rate Limiting | `express-rate-limit` | Global: 200 req/15min. Write ops: 10-20 req/min per IP |
| Input Validation | Custom | parseInt/parseFloat with NaN checks, range validation |
| XSS Prevention | Custom | HTML tag stripping via `/<[^>]*>/g` regex on all text inputs |
| Payload Limits | Express | Body capped at 1MB (10MB for multipart image uploads) |
| File Validation | `multer` | 5MB max, JPEG/PNG/GIF/WebP only, memory storage |
| Image Storage | `@aws-sdk/client-s3` | Upload to S3, auto-delete on product removal |
| Compression | `compression` | Gzip response compression |
| Logging | `morgan` | Combined format (production) / dev format (local) |
| Trust Proxy | Express | Correct client IP behind ALB for rate limiting |
| Graceful Shutdown | Custom | SIGTERM/SIGINT: close HTTP server + DB pool, force exit after 10s |

---

## 3. AWS Deployment Step-by-Step

### 3.1 Create RDS MySQL Instance
1. Go to RDS Console -> Create Database
2. **Engine**: MySQL 8.0
3. **Template**: Free tier (or Dev/Test)
4. **Instance**: `db.t3.micro` (cheapest!)
5. **Storage**: 20 GB gp2 (minimum)
6. **Multi-AZ**: NO (saves money)
7. **Public access**: Yes (for initial setup, disable later)
8. **DB name**: `b2bmarket`
9. **Master username**: `admin`
10. **Master password**: `lab-password`
11. **Disable Enhanced Monitoring** (not supported in lab)
12. After creation, run `deployment/db-init.sql` using MySQL client

### 3.2 Create S3 Bucket for Product Images
```bash
# Create bucket
aws s3 mb s3://b2b-marketplace-images --region us-east-1

# Set public read policy for product images
aws s3api put-bucket-policy --bucket b2b-marketplace-images --policy '{
  "Version":"2012-10-17",
  "Statement":[{
    "Effect":"Allow",
    "Principal":"*",
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::b2b-marketplace-images/*"
  }]
}'

# Disable block public access (required for public images)
aws s3api put-public-access-block --bucket b2b-marketplace-images --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### 3.3 Create ECR Repositories
```bash
aws ecr create-repository --repository-name shop --region us-east-1
aws ecr create-repository --repository-name supplier --region us-east-1
```

### 3.4 Build & Push Docker Images
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build and push Shop
cd microservices/shop
docker build -t shop .
docker tag shop:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/shop:latest

# Build and push Supplier
cd ../supplier
docker build -t supplier .
docker tag supplier:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/supplier:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/supplier:latest
```

### 3.5 Create ECS Cluster
1. Go to ECS Console -> Create Cluster
2. **Name**: `b2b-marketplace`
3. **Infrastructure**: AWS Fargate (serverless)

### 3.6 Create Task Definitions
1. Update `deployment/taskdef-shop.json` and `taskdef-supplier.json`:
   - Replace `<IMAGE1_NAME>` with your ECR image URI
   - Replace `<ACCOUNT-ID>` with your AWS account ID
   - Replace `<RDS-ENDPOINT>` with your RDS endpoint
2. For supplier task definition, add S3 environment variable:
   ```json
   { "name": "S3_BUCKET", "value": "b2b-marketplace-images" }
   ```
3. Register task definitions:
```bash
aws ecs register-task-definition --cli-input-json file://deployment/taskdef-shop.json
aws ecs register-task-definition --cli-input-json file://deployment/taskdef-supplier.json
```

### 3.7 Create CloudWatch Log Groups
```bash
aws logs create-log-group --log-group-name /ecs/shop --region us-east-1
aws logs create-log-group --log-group-name /ecs/supplier --region us-east-1
```

### 3.8 Create Application Load Balancer
1. Go to EC2 Console -> Load Balancers -> Create ALB
2. **Name**: `b2b-alb`
3. **Scheme**: Internet-facing
4. **Listeners**: HTTP:80
5. Create 2 Target Groups:
   - `shop-tg` (port 8080, health check: `/health`)
   - `supplier-tg` (port 8080, health check: `/health`)
6. ALB Listener Rules:
   - Path `/admin/*` -> `supplier-tg`
   - Default -> `shop-tg`

### 3.9 Create ECS Services
```bash
# Shop service
aws ecs create-service \
  --cluster b2b-marketplace \
  --service-name shop-service \
  --task-definition shop \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<SUBNET_ID>],securityGroups=[<SG_ID>],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=<SHOP_TG_ARN>,containerName=shop,containerPort=8080

# Supplier service
aws ecs create-service \
  --cluster b2b-marketplace \
  --service-name supplier-service \
  --task-definition supplier \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<SUBNET_ID>],securityGroups=[<SG_ID>],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=<SUPPLIER_TG_ARN>,containerName=supplier,containerPort=8080
```

### 3.10 Set Up CI/CD Pipeline (for at least 1 service)
1. **CodeCommit**: Create repo, push code
2. **CodeBuild**: Create project using `buildspec.yml`
   - Environment: Managed image, Amazon Linux 2, Standard runtime
   - Privileged mode: YES (needed for Docker)
   - Environment variables: `AWS_ACCOUNT_ID`, `AWS_DEFAULT_REGION=us-east-1`
3. **CodePipeline**: Source (CodeCommit) -> Build (CodeBuild) -> Deploy (ECS)

---

## 4. Budget Management ($50 Learner Lab)

### CRITICAL: Your $50 budget must last the entire project!

### Cost Breakdown (Estimated per day if left running 24h)

| Service | Config | Cost/Hour | Cost/Day | Cost/Month |
|---|---|---|---|---|
| **RDS MySQL** | db.t3.micro | $0.017 | **$0.41** | $12.41 |
| **ECS Fargate** (2 tasks) | 0.25 vCPU, 0.5GB each | $0.012 x 2 | **$0.58** | $17.47 |
| **ALB** | 1 ALB | $0.023 | **$0.54** | $16.43 |
| **S3** | Product images (~10MB) | ~$0.00 | **~$0.00** | ~$0.01 |
| **ECR** | Storage | ~$0.001 | **$0.02** | $0.50 |
| **CloudWatch** | Logs | ~$0.001 | **$0.02** | $0.50 |
| **NAT Gateway** | IF CREATED | $0.045 | **$1.08** | $32.40 |
| **TOTAL (no NAT)** | | ~$0.052 | **~$1.57** | ~$47 |
| **TOTAL (with NAT)** | | ~$0.097 | **~$2.65** | ~$79 |

### TOP BUDGET KILLERS TO AVOID

1. **NAT Gateway** (~$1.08/day) -- Use PUBLIC subnets for ECS tasks instead! Set `assignPublicIp: ENABLED` in ECS service network config.
2. **RDS left running** (~$0.41/day) -- RDS does NOT auto-stop when lab session ends! Stop it manually.
3. **Forgetting to scale down** -- Set ECS desired count to 0 when not using.
4. **Multiple ALBs** -- Use 1 ALB with path-based routing for both services.
5. **Large RDS instance** -- Always use `db.t3.micro` (smallest).

Note: S3 cost is negligible (~$0.01/month for product images). No need to worry about S3 budget.

### Budget-Saving Actions

#### Before Every Break / End of Day:
```bash
# 1. Scale ECS services to 0 (stops Fargate costs immediately)
aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 0
aws ecs update-service --cluster b2b-marketplace --service supplier-service --desired-count 0

# 2. Stop RDS instance (IMPORTANT - won't auto-stop!)
aws rds stop-db-instance --db-instance-identifier b2bmarket-db
```

#### When Resuming Work:
```bash
# 1. Start RDS
aws rds start-db-instance --db-instance-identifier b2bmarket-db
# Wait 3-5 minutes for RDS to be available

# 2. Scale ECS services back up
aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 1
aws ecs update-service --cluster b2b-marketplace --service supplier-service --desired-count 1
```

#### RDS Auto-Restart Warning
If you stop an RDS instance, AWS will **automatically restart it after 7 days**. If you're not using it, stop it again or delete it.

### Recommended Budget Timeline

| Phase | Days | Daily Cost | Total |
|---|---|---|---|
| **Setup & Development** (Cloud9) | 3 days | ~$0.50 | $1.50 |
| **Deployment & Testing** (all services running) | 5 days | ~$1.57 | $7.85 |
| **Demo Day** (everything running) | 1 day | ~$1.57 | $1.57 |
| **Buffer** | -- | -- | $10 |
| **TOTAL ESTIMATED** | | | **~$21** |
| **Remaining Safety Margin** | | | **~$29** |

### If Budget Gets Low (<$15 remaining)

1. Delete the ALB (biggest ongoing cost after RDS)
2. Delete ECS services (set desired count to 0)
3. Stop RDS instance
4. Only start everything again on demo day
5. Use `docker-compose.yml` for local development/testing instead

---

## 5. Demo Script (Saga Workflow)

This is the recommended demo flow for the presentation. It demonstrates the Saga pattern, compensating transactions, and the full order lifecycle.

### Step 1: Show Product Catalog (Shop Service)
1. Open Shop home page -> Browse Products
2. Show product images (loaded from S3), search functionality
3. Click a product -> show detail page with image

### Step 2: Create Order (Saga Step 1 - Reserve Stock)
1. Note the current stock level (e.g., 100)
2. Place an order with quantity 10
3. Show order created with status "pending"
4. Go back to products -> stock is now 90

### Step 3: Confirm Order (Saga Step 2 - Supplier)
1. Switch to Supplier Panel (/admin/)
2. Go to Orders -> see the new pending order
3. Click Confirm -> status changes to "confirmed"

### Step 4: Process Payment (Saga Step 3 - Payment)
1. Click "Process Payment" on the confirmed order
2. Select payment method (bank_transfer / qr_code / cod)
3. Submit -> status changes to "paid"
4. Payment is recorded in payments table

### Step 5: Demonstrate Failure Handling (Compensating Transaction)
1. Create another order (quantity: 5, stock goes from 90 to 85)
2. Confirm the order
3. Cancel the order from Supplier Panel
4. Show stock restored to 90 (compensating transaction)
5. Show order status changed to "cancelled"

### Step 6: Show AWS Infrastructure
1. Open ECS Console -> show running tasks
2. Open ALB Console -> show listener rules and target groups
3. Open CloudWatch -> show log streams
4. Open S3 Console -> show uploaded product images
5. Open CodePipeline -> show pipeline stages (if configured)

### Step 7: Demonstrate CI/CD (Update & Redeploy)
1. Make a small change (e.g., update home page text)
2. Push to CodeCommit
3. Show pipeline automatically triggered
4. Show new version deployed (blue/green)

---

## 6. Daily Checklist

### Before Starting Work
- [ ] Start lab session
- [ ] Start RDS instance (if stopped)
- [ ] Scale ECS services to desired-count 1
- [ ] Check budget in lab interface

### Before Stopping Work / End of Session
- [ ] **Scale ECS services to 0** (`aws ecs update-service --desired-count 0`)
- [ ] **Stop RDS instance** (`aws rds stop-db-instance`)
- [ ] Verify in console: no running ECS tasks, RDS status = "stopped"
- [ ] Check budget spent today
- [ ] Check if any NAT Gateway exists -> DELETE IT if found

### Before Demo Day
- [ ] Start all services 30 minutes early
- [ ] Test all workflows (create order, confirm, payment, cancel)
- [ ] Upload a test product image to verify S3
- [ ] Prepare screenshots for report
- [ ] Have CloudWatch logs open to show monitoring

### After Demo (Project Complete)
- [ ] Delete ALL resources to preserve any remaining budget:
  ```bash
  # Delete ECS services
  aws ecs delete-service --cluster b2b-marketplace --service shop-service --force
  aws ecs delete-service --cluster b2b-marketplace --service supplier-service --force
  # Delete ECS cluster
  aws ecs delete-cluster --cluster b2b-marketplace
  # Delete ALB and Target Groups
  # Delete RDS instance (skip final snapshot)
  aws rds delete-db-instance --db-instance-identifier b2bmarket-db --skip-final-snapshot
  # Delete ECR repositories
  aws ecr delete-repository --repository-name shop --force
  aws ecr delete-repository --repository-name supplier --force
  # Delete S3 bucket
  aws s3 rb s3://b2b-marketplace-images --force
  # Delete CloudWatch log groups
  aws logs delete-log-group --log-group-name /ecs/shop
  aws logs delete-log-group --log-group-name /ecs/supplier
  ```
