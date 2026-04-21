# B2B Marketplace - Deployment Guide

## Table of Contents

- [Phase 1: Planning the Design and Estimating Cost](#phase-1-planning-the-design-and-estimating-cost)
- [Phase 2: Setting Up the Development Environment (Cloud9)](#phase-2-setting-up-the-development-environment-cloud9)
- [Phase 3: Creating a CodeCommit Repository and Pushing Code](#phase-3-creating-a-codecommit-repository-and-pushing-code)
- [Phase 4: Building and Testing Microservices in Docker](#phase-4-building-and-testing-microservices-in-docker)
- [Phase 5: Creating ECR Repositories, ECS Cluster, Task Definitions, and AppSpec Files](#phase-5-creating-ecr-repositories-ecs-cluster-task-definitions-and-appspec-files)
- [Phase 6: Creating the Database (Amazon RDS)](#phase-6-creating-the-database-amazon-rds)
- [Phase 7: Creating Target Groups and an Application Load Balancer](#phase-7-creating-target-groups-and-an-application-load-balancer)
- [Phase 8: Creating Two Amazon ECS Services](#phase-8-creating-two-amazon-ecs-services)
- [Phase 9: Configuring CodeDeploy and CodePipeline (No CodeBuild)](#phase-9-configuring-codedeploy-and-codepipeline-no-codebuild)
- [Phase 10: Testing the CI/CD Pipeline](#phase-10-testing-the-cicd-pipeline)
- [Phase 11: Setting Up CloudWatch Monitoring](#phase-11-setting-up-cloudwatch-monitoring)
- [IAM Roles and Permissions (Learner Lab)](#iam-roles-and-permissions-learner-lab)
- [Security Architecture](#security-architecture)
- [Budget Management ($50 Learner Lab)](#budget-management-50-learner-lab)
- [Demo Script (Saga Workflow)](#demo-script-saga-workflow)
- [Daily Checklist](#daily-checklist)

---

## Phase 1: Planning the Design and Estimating Cost

### Task 1.1: Review the Architecture Diagram

Open `docs/architecture-diagram.html` in a browser to view the system architecture. The diagram illustrates:

- **Networking (VPC)**: LabVPC with Public Subnet 1 and Public Subnet 2
- **Database (Amazon RDS)**: MySQL 8.0 instance (`db.t3.micro`) within the LabVPC
- **User Access**: Application Load Balancer (ALB) receives requests on HTTP:80 and routes traffic
- **Compute (Amazon ECS/Fargate)**: ECS Cluster running Tasks for the Shop Microservice and Supplier Microservice
- **Storage (Amazon S3)**: Bucket for product images uploaded by suppliers
- **CI/CD**: AWS CodePipeline workflow (Source → Deploy, no build stage) triggered by Amazon ECR image updates, using CodeDeploy for blue/green ECS deployments
- **Monitoring**: Amazon CloudWatch for container logs and metrics
- **Development Environment**: AWS Cloud9 IDE

### Task 1.2: Develop a Cost Estimate

Access the [AWS Pricing Calculator](https://calculator.aws/). Select Region: **US East (N. Virginia) (us-east-1)**. Add services and assume an operational time of **1 month** (Learner Lab budget):

| Service | Configuration | Estimated Cost/Day | Estimated Cost/Month |
|---|---|---|---|
| Amazon RDS (MySQL) | db.t3.micro, 20GB gp2, Single-AZ | $0.41 | $12.41 |
| Amazon ECS (Fargate) | 2 Tasks × 0.25 vCPU, 0.5GB RAM | $0.58 | $17.47 |
| Application Load Balancer | 1 ALB, minimal LCUs | $0.54 | $16.43 |
| Amazon S3 | ~10MB product images | ~$0.00 | ~$0.01 |
| Amazon ECR | ~500MB Docker images | ~$0.02 | ~$0.50 |
| Amazon CloudWatch | Log storage | ~$0.02 | ~$0.50 |
| AWS CodePipeline | 2 pipelines (free tier: 1 free) | ~$0.03 | ~$1.00 |
| AWS CodeDeploy | ECS deployments (free) | $0.00 | $0.00 |
| AWS CodeCommit | 1 repo (free tier: 5 users) | $0.00 | $0.00 |
| **TOTAL** | | **~$1.60** | **~$48** |

> **⚠️ CRITICAL**: Do NOT create a NAT Gateway (~$1.08/day = $32/month). Use public subnets with `assignPublicIp: ENABLED` for ECS tasks.

---

## Phase 2: Setting Up the Development Environment (Cloud9)

### Task 2.1: Create an AWS Cloud9 IDE

1. Search for **Cloud9** in the AWS Console
2. Select **Create environment**
3. Configure:
   - **Name**: `B2BMarketplaceIDE`
   - **Environment type**: New EC2 instance
   - **Instance type**: `t3.small`
   - **Platform**: Amazon Linux 2
   - **Network settings**:
     - Connection: Select **Secure Shell (SSH)**
     - VPC: Select **LabVPC**
     - Subnet: Select **Public Subnet 1**
4. Select **Create** → Wait for environment to be ready → Select **Open**

### Task 2.2: Verify Docker and Git are available in Cloud9

In the Cloud9 terminal, run:
```bash
docker --version
git --version
aws --version
```

All three commands should return version information. Cloud9 on Amazon Linux 2 comes with Docker and Git pre-installed.

### Task 2.3: Increase Cloud9 disk space (if needed)

If disk space runs low during Docker builds:
```bash
# Check current disk usage
df -h

# Resize EBS volume to 20GB (if default 10GB is too small)
# Go to EC2 Console → Volumes → Find the Cloud9 instance volume → Modify → Change to 20GB
# Then in Cloud9 terminal:
sudo growpart /dev/xvda 1
sudo resize2fs /dev/xvda1
```

---

## Phase 3: Creating a CodeCommit Repository and Pushing Code

### Task 3.1: Create an AWS CodeCommit repository

1. Open the **AWS CodeCommit** console
2. Select **Create repository**
3. **Repository name**: `b2b-marketplace`
4. **Description**: B2B Marketplace microservices project
5. Select **Create**

### Task 3.2: Clone the project code to Cloud9

If you have the code on GitHub or locally, download and upload it to Cloud9:

```bash
# Option A: Clone from GitHub (if project is on GitHub)
cd ~/environment
git clone https://github.com/<YOUR-USERNAME>/b2b-marketplace.git
cd b2b-marketplace

# Option B: Upload files manually to Cloud9
# Use File → Upload Local Files in the Cloud9 menu
```

### Task 3.3: Verify the project structure

```bash
cd ~/environment/b2b-marketplace
ls -la
```

You should see:
```
├── GUIDE.md
├── README.md
├── docker-compose.yml
├── deployment/
│   ├── db-init.sql
│   ├── appspec-shop.yaml
│   ├── appspec-supplier.yaml
│   ├── taskdef-shop.json
│   ├── taskdef-supplier.json
│   ├── create-shop-microservice-tg-two.json
│   └── create-supplier-microservice-tg-two.json
└── microservices/
    ├── shop/
    │   ├── Dockerfile
    │   ├── index.js
    │   ├── package.json
    │   └── app/
    └── supplier/
        ├── Dockerfile
        ├── index.js
        ├── package.json
        └── app/
```

### Task 3.4: Push the code to CodeCommit

```bash
cd ~/environment/b2b-marketplace

# Initialize Git and commit
git init
git branch -m main
git add .
git commit -m "Initial commit: B2B Marketplace microservices"

# Add CodeCommit remote and push
git remote add codecommit https://git-codecommit.us-east-1.amazonaws.com/v1/repos/b2b-marketplace
git push -u codecommit main

# Configure Git user identity
git config --global user.name "<Your Name>"
git config --global user.email "<your-email@example.com>"
```

### Task 3.5: Verify the repository in CodeCommit console

1. Open the **CodeCommit** console
2. Select the `b2b-marketplace` repository
3. Confirm all files are visible in the **main** branch

---

## Phase 4: Building and Testing Microservices in Docker

### Task 4.1: Adjust the Cloud9 instance security group

1. In the **Amazon EC2** console, find the Security Group attached to the Cloud9 instance
2. Select the Security Group → **Edit Inbound Rules**
3. Add two rules:
   - Type: **Custom TCP**, Port Range: **8080**, Source: **Anywhere (0.0.0.0/0)**
   - Type: **Custom TCP**, Port Range: **8081**, Source: **Anywhere (0.0.0.0/0)**
4. Select **Save rules**

### Task 4.2: Start a local MySQL database for testing

```bash
cd ~/environment/b2b-marketplace

# Start only the MySQL container from docker-compose
docker run -d \
  --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=b2bmarket \
  -e MYSQL_USER=admin \
  -e MYSQL_PASSWORD=lab-password \
  -p 3306:3306 \
  mysql:8.0

# Wait for MySQL to be ready (~15 seconds)
sleep 15

# Initialize the database with schema and seed data
docker exec -i mysql-test mysql -uadmin -plab-password b2bmarket < deployment/db-init.sql
```

### Task 4.3: Build and test the Shop microservice

```bash
cd ~/environment/b2b-marketplace/microservices/shop

# Build the Docker image
docker build --tag shop .

# View built images
docker images

# Run the Shop container
docker run -d --name shop_1 -p 8080:8080 \
  -e APP_DB_HOST="host.docker.internal" \
  -e APP_DB_USER="admin" \
  -e APP_DB_PASSWORD="lab-password" \
  -e APP_DB_NAME="b2bmarket" \
  -e APP_DB_PORT="3306" \
  shop

# Note: On Cloud9 Linux, use the Cloud9 instance's private IP instead of host.docker.internal
# Get it with: hostname -I | awk '{print $1}'
```

Test: Access `http://<Cloud9-Public-IP>:8080` in a browser. Confirm:
- Login page loads at `/login`
- Health check works at `/health`

### Task 4.4: Build and test the Supplier microservice

```bash
cd ~/environment/b2b-marketplace/microservices/supplier

# Build the Docker image
docker build --tag supplier .

# Run the Supplier container
docker run -d --name supplier_1 -p 8081:8080 \
  -e APP_DB_HOST="host.docker.internal" \
  -e APP_DB_USER="admin" \
  -e APP_DB_PASSWORD="lab-password" \
  -e APP_DB_NAME="b2bmarket" \
  -e APP_DB_PORT="3306" \
  supplier
```

Test: Access `http://<Cloud9-Public-IP>:8081/admin/login` in a browser. Confirm:
- Supplier login page loads
- Admin dashboard accessible after login

### Task 4.5: Clean up test containers

```bash
docker rm -f shop_1 supplier_1 mysql-test
```

### Task 4.6: Commit and push code to CodeCommit

```bash
cd ~/environment/b2b-marketplace
git add .
git commit -m "Verified: both microservices build and run correctly in Docker"
git push codecommit main
```

---

## Phase 5: Creating ECR Repositories, ECS Cluster, Task Definitions, and AppSpec Files

### Task 5.1: Create ECR repositories and push Docker images

```bash
# Get the Account ID
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)
echo "Account ID: $account_id"

# Log Docker into ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS \
  --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com

# Create 2 Private ECR repositories
aws ecr create-repository --repository-name shop
aws ecr create-repository --repository-name supplier
```

Verify: Search **ECR** in the console → Select **Repositories** → Confirm `shop` and `supplier` exist.

```bash
# Tag local Docker images for ECR
docker tag shop:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker tag supplier:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest

# Verify tags
docker images

# Push images to ECR
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest
```

Verify: In the ECR console → Select each repository → Confirm the `latest` image tag exists.

### Task 5.2: Create an ECS cluster

1. Open the **Amazon ECS** console
2. Select **Create Cluster**
3. **Cluster name**: `b2b-marketplace`
4. **Infrastructure**: Select **AWS Fargate (serverless)** only (uncheck EC2 instances if checked)
5. Select **Create**

### Task 5.3: Create task definition files and register them

The task definition files are already in the `deployment/` directory. You need to update the placeholder values.

```bash
cd ~/environment/b2b-marketplace/deployment

# Get required values
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)
echo "Account ID: $account_id"

# Get RDS endpoint (after RDS is created in Phase 6)
# For now, note the placeholder <RDS-ENDPOINT> — you will update this after creating RDS
```

Edit `taskdef-shop.json`:
- **Line 7** (`"image"`): Replace `<IMAGE1_NAME>` with `<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/shop:latest`
- **Line 18** (`APP_DB_HOST`): Replace `<RDS-ENDPOINT>` with the actual RDS endpoint
- **Line 51** (`executionRoleArn`): Replace `<ACCOUNT-ID>` with your AWS account ID
- **Line 52** (`taskRoleArn`): Replace `<ACCOUNT-ID>` with your AWS account ID

> **IAM Note**: Both `executionRoleArn` and `taskRoleArn` use **LabRole** — the pre-configured role in AWS Academy Learner Lab. You cannot create custom IAM roles in the Learner Lab. See [IAM Roles and Permissions](#iam-roles-and-permissions-learner-lab) for details.

Edit `taskdef-supplier.json`:
- Same replacements as above, changing `shop` to `supplier`
- Also add the S3 bucket environment variable (for product image uploads):
```json
{ "name": "S3_BUCKET", "value": "b2b-marketplace-images" }
```

Register the task definitions:
```bash
aws ecs register-task-definition --cli-input-json file://taskdef-shop.json
aws ecs register-task-definition --cli-input-json file://taskdef-supplier.json
```

Verify: In the ECS console → **Task Definitions** → Confirm `shop` and `supplier` are listed with revision 1.

### Task 5.4: Create CloudWatch Log Groups

The task definitions reference CloudWatch log groups. Create them before running tasks:

```bash
aws logs create-log-group --log-group-name /ecs/shop --region us-east-1
aws logs create-log-group --log-group-name /ecs/supplier --region us-east-1
```

### Task 5.5: Verify the AppSpec files for CodeDeploy

The AppSpec files are already created in the `deployment/` directory:
- `appspec-shop.yaml` — references container name `shop` on port 8080
- `appspec-supplier.yaml` — references container name `supplier` on port 8080

These files tell CodeDeploy how to deploy the new task definition during blue/green deployments.

### Task 5.6: Reset image placeholder and push deployment files to CodeCommit

Before setting up the pipeline, change the `image` field back to the placeholder `<IMAGE1_NAME>` in both task definitions. CodePipeline will dynamically replace this during deployment.

```bash
cd ~/environment/b2b-marketplace
git add .
git commit -m "Task definitions and AppSpec files with IMAGE1_NAME placeholder"
git push codecommit main
```

---

## Phase 6: Creating the Database (Amazon RDS)

### Task 6.1: Create an RDS MySQL instance

1. Open the **Amazon RDS** console → Select **Create database**
2. Configure:
   - **Engine**: MySQL 8.0
   - **Template**: Free tier (or Dev/Test)
   - **DB instance identifier**: `b2bmarket-db`
   - **Master username**: `admin`
   - **Master password**: `lab-password`
   - **DB instance class**: `db.t3.micro` (cheapest)
   - **Storage**: 20 GB gp2 (minimum), disable auto-scaling
   - **Multi-AZ**: **NO** (saves cost)
   - **VPC**: LabVPC
   - **Public access**: **Yes** (for initial setup from Cloud9; can restrict later via security groups)
   - **VPC security group**: Create new → `b2b-rds-sg`
   - **Initial database name**: `b2bmarket`
   - **Disable Enhanced Monitoring** (not supported in Learner Lab)
   - **Disable Performance Insights** (costs extra)
   - **Backup retention**: 1 day (minimum)
3. Select **Create database**
4. Wait 5-10 minutes for the instance to become **Available**

### Task 6.2: Configure the RDS security group

1. In the **EC2** console → **Security Groups** → Find `b2b-rds-sg`
2. Edit **Inbound Rules**:
   - Type: **MySQL/Aurora (TCP 3306)**, Source: **Custom** → Enter the Cloud9 security group ID (for setup access)
   - Type: **MySQL/Aurora (TCP 3306)**, Source: **Custom** → Enter the ECS security group ID (created later in Phase 7)
3. Select **Save rules**

> **Security concept (Least Privilege)**: The RDS security group only allows connections from Cloud9 (for setup) and ECS tasks (for application access). The database is never directly accessible from the internet.

### Task 6.3: Initialize the database

```bash
# Get the RDS endpoint
# Go to RDS Console → Databases → b2bmarket-db → Copy the Endpoint

# Connect to the database from Cloud9
mysql -h <RDS-ENDPOINT> -u admin -p
# Enter password: lab-password

# Verify connection
SHOW DATABASES;
USE b2bmarket;

# Exit MySQL
exit
```

Load the schema and seed data:
```bash
mysql -h <RDS-ENDPOINT> -u admin -plab-password b2bmarket < ~/environment/b2b-marketplace/deployment/db-init.sql
```

Verify:
```bash
mysql -h <RDS-ENDPOINT> -u admin -plab-password b2bmarket -e "SHOW TABLES;"
```

You should see tables: `users`, `products`, `rfqs`, `quotes`, `contracts`, `orders`, `payments`.

### Task 6.4: Update task definitions with the RDS endpoint

```bash
cd ~/environment/b2b-marketplace/deployment

# Replace the placeholder in both task definition files
# Use the actual RDS endpoint (e.g., b2bmarket-db.cxxxxx.us-east-1.rds.amazonaws.com)
sed -i 's/<RDS-ENDPOINT>/b2bmarket-db.cxxxxx.us-east-1.rds.amazonaws.com/g' taskdef-shop.json taskdef-supplier.json
```

---

## Phase 7: Creating Target Groups and an Application Load Balancer

### Task 7.1: Create a security group for the ALB and ECS tasks

In the **EC2** console → **Security Groups** → **Create Security Group**:

**Security Group 1: ALB Security Group**
- **Name**: `b2b-alb-sg`
- **VPC**: LabVPC
- **Inbound Rules**:
  - Type: **HTTP (TCP 80)**, Source: **Anywhere (0.0.0.0/0)**
- **Outbound Rules**: Default (all traffic)

**Security Group 2: ECS Tasks Security Group**
- **Name**: `b2b-ecs-sg`
- **VPC**: LabVPC
- **Inbound Rules**:
  - Type: **Custom TCP**, Port: **8080**, Source: **Custom** → `b2b-alb-sg` (ALB security group)
- **Outbound Rules**: Default (all traffic — needed for ECR pulls, RDS access, S3 access, CloudWatch)

Then update the RDS security group (`b2b-rds-sg`) to allow traffic from ECS:
- Add Inbound Rule: Type: **MySQL/Aurora (TCP 3306)**, Source: **Custom** → `b2b-ecs-sg`

```
┌─────────────────────────────────────────────────────────┐
│  b2b-alb-sg (ALB Security Group)                        │
│  Inbound:  TCP 80 from 0.0.0.0/0 (Internet)            │
│  Outbound: All traffic                                  │
└──────────────────────┬──────────────────────────────────┘
                       │ TCP 8080
                       ▼
┌─────────────────────────────────────────────────────────┐
│  b2b-ecs-sg (ECS Tasks Security Group)                  │
│  Inbound:  TCP 8080 from b2b-alb-sg only                │
│  Outbound: All traffic (ECR, S3, CloudWatch, RDS)       │
└──────────────────────┬──────────────────────────────────┘
                       │ TCP 3306
                       ▼
┌─────────────────────────────────────────────────────────┐
│  b2b-rds-sg (RDS Security Group)                        │
│  Inbound:  TCP 3306 from b2b-ecs-sg only                │
│  Outbound: None required                                │
└─────────────────────────────────────────────────────────┘
```

> **Security concept (Defense in Depth)**: Each layer only accepts traffic from the layer above it. RDS is never directly accessible from the internet. This follows the **principle of least privilege** — each component has only the minimum access it needs.

### Task 7.2: Create four target groups

Blue/green deployment with CodeDeploy requires **two target groups per service** (4 total). CodeDeploy shifts ALB traffic from one target group to the other during deployments.

In the **Amazon EC2** console → **Target Groups** → **Create target group**:

| Target Group Name | Type | Port | VPC | Health Check Path |
|---|---|---|---|---|
| `shop-tg-one` | IP addresses | 8080 | LabVPC | `/health` |
| `shop-tg-two` | IP addresses | 8080 | LabVPC | `/health` |
| `supplier-tg-one` | IP addresses | 8080 | LabVPC | `/health` |
| `supplier-tg-two` | IP addresses | 8080 | LabVPC | `/health` |

For each target group:
1. Select **IP addresses** as the target type
2. Protocol: **HTTP**, Port: **8080**
3. VPC: **LabVPC**
4. Health check protocol: **HTTP**
5. Health check path: `/health`
6. Do NOT register any targets yet (ECS will register them automatically)
7. Select **Create target group**

### Task 7.3: Create an Application Load Balancer

1. In the **EC2** console → **Load Balancers** → **Create Load Balancer** → Select **Application Load Balancer**
2. Configure:
   - **Name**: `b2b-alb`
   - **Scheme**: **Internet-facing**
   - **IP address type**: IPv4
   - **VPC**: LabVPC
   - **Mappings**: Select **Public Subnet 1** and **Public Subnet 2**
   - **Security group**: Select `b2b-alb-sg`
   - **Listener HTTP:80**: Default action → Forward to `shop-tg-two`
3. Select **Create load balancer**

### Task 7.4: Configure ALB listener rules for path-based routing

1. In the **EC2** console → **Load Balancers** → Select `b2b-alb` → **Listeners and rules**
2. Select the **HTTP:80** listener → **Manage rules** → **Add rule**
3. **Add condition**: Select **Path** → Enter `/admin/*`
4. **Add action**: Forward to → Select `supplier-tg-two`
5. **Priority**: 1
6. Select **Create**

The final listener rules should be:
| Priority | Condition | Action |
|---|---|---|
| 1 | Path is `/admin/*` | Forward to `supplier-tg-two` |
| Default | All other paths | Forward to `shop-tg-two` |

> **Concept (ALB Path-Based Routing)**: A single ALB routes traffic to different microservices based on URL path. This saves cost vs. multiple ALBs and provides a single entry point for the application.

---

## Phase 8: Creating Two Amazon ECS Services

### Task 8.1: Update the ECS service configuration files

The service configuration files are in the `deployment/` directory. Update the placeholder values:

Edit `create-shop-microservice-tg-two.json`:
```bash
cd ~/environment/b2b-marketplace/deployment
```

Replace the following placeholders:
- `<REVISION-NUMBER>` → Get from **ECS Console** → **Task Definitions** → `shop` → Note the latest revision number
- `<ARN-shop-tg-two>` → Get from **EC2** → **Target Groups** → `shop-tg-two` → Copy the ARN
- `<PUBLIC-SUBNET-1-ID>` and `<PUBLIC-SUBNET-2-ID>` → Get from **VPC** → **Subnets** → Copy the Public Subnet IDs
- `<MICROSERVICES-SG-ID>` → Get from **EC2** → **Security Groups** → `b2b-ecs-sg` → Copy the Security Group ID

Edit `create-supplier-microservice-tg-two.json`:
- Same subnet and security group values
- Change ARN to `supplier-tg-two`
- Change containerName to `supplier`
- Change taskDefinition to `supplier:<REVISION-NUMBER>`

### Task 8.2: Create the ECS service for the Shop microservice

```bash
cd ~/environment/b2b-marketplace/deployment
aws ecs create-service --service-name shop-service \
  --cli-input-json file://create-shop-microservice-tg-two.json
```

Verify:
1. Open **ECS Console** → **Clusters** → `b2b-marketplace` → **Services**
2. Confirm `shop-service` is listed with **Running count: 1**
3. Check **Target Groups** → `shop-tg-two` → Confirm 1 healthy target is registered

### Task 8.3: Create the ECS service for the Supplier microservice

```bash
aws ecs create-service --service-name supplier-service \
  --cli-input-json file://create-supplier-microservice-tg-two.json
```

Verify:
1. Confirm `supplier-service` is listed in the ECS cluster
2. Check `supplier-tg-two` has 1 healthy target

### Task 8.4: Test the application via ALB

1. Copy the ALB DNS Name from **EC2** → **Load Balancers** → `b2b-alb`
2. Open `http://<ALB-DNS-Name>/` in a browser → Should show the Shop login page
3. Open `http://<ALB-DNS-Name>/admin/login` → Should show the Supplier login page
4. Open `http://<ALB-DNS-Name>/health` → Should return `{"status":"ok"}`

---

## Phase 9: Configuring CodeDeploy and CodePipeline (No CodeBuild)

> **⚠️ IMPORTANT: CodeBuild is NOT available in AWS Academy Learner Lab.** The pipeline skips the build stage. Docker images are built and pushed to ECR manually from Cloud9. The pipeline is triggered automatically when a new image is pushed to ECR.

### Task 9.1: Create a CodeDeploy application

1. Open the **CodeDeploy** console
2. Select **Create application**
3. **Application name**: `b2b-marketplace`
4. **Compute platform**: **Amazon ECS**
5. Select **Create application**

### Task 9.2: Create a deployment group for the Shop microservice

1. In the CodeDeploy application → Select **Create deployment group**
2. Configure:
   - **Deployment group name**: `b2b-shop-dg`
   - **Service role**: Select the ARN for **LabRole** (`arn:aws:iam::<ACCOUNT_ID>:role/LabRole`)
   - **Environment configuration**:
     - ECS cluster name: Select `b2b-marketplace`
     - ECS service name: Select `shop-service`
   - **Load balancer**:
     - Load balancer: Select `b2b-alb`
     - Production listener port: Select **HTTP:80**
     - Test listener port: (leave empty or select HTTP:8080 if created)
     - Target group 1 name: Select `shop-tg-two`
     - Target group 2 name: Select `shop-tg-one`
   - **Deployment settings**:
     - Traffic rerouting: Select **Reroute traffic immediately**
     - Deployment configuration: Select **CodeDeployDefault.ECSAllAtOnce**
     - Original revision termination: Days: 0, Hours: 0, Minutes: **5**
3. Select **Create deployment group**

### Task 9.3: Create a deployment group for the Supplier microservice

Repeat the same steps with:
- **Deployment group name**: `b2b-supplier-dg`
- **ECS service name**: Select `supplier-service`
- **Target group 1 name**: Select `supplier-tg-two`
- **Target group 2 name**: Select `supplier-tg-one`

### Task 9.4: Create a CodePipeline for the Shop microservice

1. Open the **CodePipeline** console → Select **Create pipeline**
2. Select **Build custom pipeline**
3. Configure:
   - **Pipeline name**: `update-shop-service`
   - **Service role**: Select **Existing service role** → Select the **LabRole** ARN (or PipelineRole if available)
4. **Source stage**:
   - Source provider: **Amazon ECR**
   - Repository name: `shop`
   - Image tag: `latest`
5. **Build stage**: Select **Skip build stage** ← ⚠️ CodeBuild not available in Learner Lab
6. **Deploy stage**:
   - Deploy provider: **Amazon ECS (Blue/Green)**
   - AWS CodeDeploy application name: `b2b-marketplace`
   - AWS CodeDeploy deployment group: `b2b-shop-dg`
   - Amazon ECS task definition: Select **BuildArtifact** → Enter `deployment/taskdef-shop.json`
   - AWS CodeDeploy AppSpec file: Select **BuildArtifact** → Enter `deployment/appspec-shop.yaml`
   - Input artifact with image details: Select **SourceArtifact**
   - Placeholder text in the task definition: `<IMAGE1_NAME>`
7. Select **Create pipeline**

> The pipeline will attempt to run immediately. It may fail on the first run because the source artifact structure may need adjustment. This is expected — the pipeline will work correctly on subsequent ECR image pushes.

### Task 9.5: Create a CodePipeline for the Supplier microservice

Repeat the same steps with:
- **Pipeline name**: `update-supplier-service`
- **Source stage**: ECR repository `supplier`, tag `latest`
- **Deploy stage**: deployment group `b2b-supplier-dg`, task def `deployment/taskdef-supplier.json`, appspec `deployment/appspec-supplier.yaml`

### How the CI/CD Pipeline Works

```
Developer makes code changes
        │
        ▼
Builds Docker image locally/Cloud9
        │
        ▼
Pushes new image to ECR (shop:latest or supplier:latest)
        │
        ▼
ECR image update automatically triggers CodePipeline
        │
        ▼
CodePipeline → CodeDeploy (Blue/Green)
        │
        ▼
CodeDeploy creates new ECS tasks in standby target group (tg-one)
        │
        ▼
Health check passes → ALB traffic switches to new tasks
        │
        ▼
Old tasks in previous target group (tg-two) terminated after 5 minutes
```

---

## Phase 10: Testing the CI/CD Pipeline

### Task 10.1: Make a code change to trigger the pipeline

```bash
cd ~/environment/b2b-marketplace/microservices/shop

# Make a visible change (e.g., update the home page title)
# Edit views/home.ejs — change any visible text
```

### Task 10.2: Build and push the updated image to ECR

```bash
# Rebuild the Shop image
cd ~/environment/b2b-marketplace/microservices/shop
docker build --tag shop .

# Tag and push to ECR
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)
docker tag shop:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest

aws ecr get-login-password --region us-east-1 | docker login --username AWS \
  --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com

docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
```

### Task 10.3: Monitor the pipeline execution

1. Open the **CodePipeline** console → Select `update-shop-service`
2. Observe the pipeline stages:
   - **Source** stage: Detects new ECR image → ✅
   - **Deploy** stage: CodeDeploy blue/green deployment in progress
3. Open **CodeDeploy** console → Deployments → Watch the deployment progress
4. Wait for deployment to complete (typically 3-5 minutes)

### Task 10.4: Verify the deployment

1. Open the ALB DNS URL in a browser
2. Confirm the code change is visible
3. Check **EC2** → **Target Groups** → Observe how CodeDeploy swapped the target groups (traffic now goes to `tg-one` instead of `tg-two`)

### Task 10.5: Scale the Shop microservice

```bash
# Scale to 2 tasks for the Shop service
aws ecs update-service --cluster b2b-marketplace \
  --service shop-service --desired-count 2

# Verify in ECS Console → Services → shop-service → Tasks tab
# Should show 2 running tasks
```

---

## Phase 11: Setting Up CloudWatch Monitoring

### Task 11.1: View container logs in CloudWatch

1. Open the **CloudWatch** console → **Log groups**
2. Select `/ecs/shop` → View the latest log stream
3. You should see Express HTTP request logs (Morgan combined format):
   ```
   ::ffff:10.0.1.x - - [21/Apr/2026:06:00:00 +0000] "GET /health HTTP/1.1" 200 15 "-" "ELB-HealthChecker/2.0"
   ```
4. Select `/ecs/supplier` → Verify supplier logs are also present

### Task 11.2: Create CloudWatch alarms (recommended)

```bash
# SNS topic for alarm notifications (optional)
aws sns create-topic --name b2b-alerts
aws sns subscribe --topic-arn arn:aws:sns:us-east-1:<ACCOUNT_ID>:b2b-alerts \
  --protocol email --notification-endpoint <your-email@example.com>

# High CPU alarm for Shop service
aws cloudwatch put-metric-alarm \
  --alarm-name shop-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ClusterName,Value=b2b-marketplace Name=ServiceName,Value=shop-service \
  --evaluation-periods 2 \
  --treat-missing-data missing

# Unhealthy target count alarm for ALB
aws cloudwatch put-metric-alarm \
  --alarm-name shop-unhealthy-targets \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Maximum \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=TargetGroup,Value=<SHOP_TG_ARN_SUFFIX> Name=LoadBalancer,Value=<ALB_ARN_SUFFIX> \
  --evaluation-periods 1 \
  --treat-missing-data notBreaching
```

### Task 11.3: Create a CloudWatch dashboard (optional)

1. Open **CloudWatch** → **Dashboards** → **Create dashboard**
2. **Name**: `B2B-Marketplace`
3. Add widgets:
   - **ECS CPU Utilization**: Line graph → Namespace: AWS/ECS → Metric: CPUUtilization → Dimensions: ClusterName=b2b-marketplace
   - **ECS Memory Utilization**: Line graph → Same namespace → Metric: MemoryUtilization
   - **ALB Request Count**: Line graph → Namespace: AWS/ApplicationELB → Metric: RequestCount
   - **ALB Target Response Time**: Line graph → Metric: TargetResponseTime
   - **RDS Connections**: Line graph → Namespace: AWS/RDS → Metric: DatabaseConnections
4. Select **Save dashboard**

> **Monitoring concept**: CloudWatch provides centralized observability. Container logs show application behavior, ECS metrics show resource usage, ALB metrics show traffic patterns, and alarms provide automated notification when thresholds are breached.

---

## IAM Roles and Permissions (Learner Lab)

### Learner Lab IAM Restrictions

AWS Academy Learner Lab has **strict IAM limitations**:
- ❌ **Cannot** create IAM users, groups, or custom roles
- ❌ **Cannot** create or modify IAM policies
- ❌ **Cannot** use IAM Identity Center (SSO)
- ✅ **Can** use the pre-configured `LabRole` for all services
- ✅ **Can** use the `LabInstanceProfile` for EC2 instances
- ✅ **Can** create service-linked roles (automatically created by AWS services)

### How LabRole is Used Across Services

The `LabRole` is a pre-configured IAM role with broad permissions across supported AWS services. It is assigned to every service context in this project:

| Context | Role Used | Purpose | Related IAM Concept |
|---|---|---|---|
| **ECS Task Execution Role** | `LabRole` | Pull images from ECR, push logs to CloudWatch | Service role — allows ECS agent to act on your behalf |
| **ECS Task Role** | `LabRole` | Runtime: access RDS, S3 (image uploads), CloudWatch | Application role — grants permissions to the running container |
| **CodeDeploy Service Role** | `LabRole` | Manage ECS deployments, modify ALB target groups | Service role — allows CodeDeploy to manage infrastructure |
| **CodePipeline Service Role** | `LabRole` | Orchestrate pipeline stages, access ECR and S3 artifacts | Service role — allows CodePipeline to invoke other services |
| **Cloud9 EC2 Instance** | `LabInstanceProfile` | AWS CLI commands, Docker push to ECR | Instance profile — attached to EC2 for AWS API access |

### IAM Concepts Applied (from Lecture 6 - M03)

| Concept | How It's Applied in This Project |
|---|---|
| **Principle of Least Privilege** | Security groups restrict access layer-by-layer (ALB → ECS → RDS). In production, each service would have its own role with minimal permissions. |
| **IAM Roles (not users) for services** | ECS tasks, CodeDeploy, and CodePipeline all use IAM roles (LabRole), not long-term credentials. This follows AWS best practice. |
| **Shared Responsibility Model** | AWS manages infrastructure security (hardware, networking, managed services). We manage application security (authentication, input validation, security groups, encryption in transit). |
| **Temporary Credentials** | ECS tasks receive temporary security credentials via the task role. Credentials rotate automatically — no static access keys needed. |
| **Identity-Based Policies** | LabRole has an identity-based policy attached that grants permissions to AWS services. In production, you would create specific policies per service. |
| **Permission Boundaries** | Learner Lab enforces permission boundaries: region limited to `us-east-1`/`us-west-2`, instance types limited, no IAM modifications. |

### Production IAM Recommendations (Beyond Learner Lab)

In a real production environment, you would create separate, least-privilege roles:

| Role | Permissions |
|---|---|
| `ecsTaskExecutionRole` | `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `logs:CreateLogStream`, `logs:PutLogEvents` |
| `shopTaskRole` | `rds-db:connect`, `s3:GetObject` (read-only S3) |
| `supplierTaskRole` | `rds-db:connect`, `s3:PutObject`, `s3:DeleteObject` (S3 write for product images) |
| `codeDeployRole` | `ecs:*`, `elasticloadbalancing:*`, `iam:PassRole` |
| `codePipelineRole` | `ecr:DescribeImages`, `codedeploy:CreateDeployment`, `s3:*` (artifacts) |

---

## Security Architecture

### Application-Level Security

| Layer | Implementation | Description |
|---|---|---|
| Authentication | `bcryptjs` + `express-session` | Password hashing (10 salt rounds), session-based login |
| Auth Middleware | `requireAuth`, `requireAdmin` | All routes protected; admin routes require admin role |
| HTTP Headers | `helmet` | X-XSS-Protection, X-Content-Type-Options, HSTS, X-Frame-Options |
| CORS | `cors` | Configurable origin restriction via `ALLOWED_ORIGINS` env var |
| Rate Limiting | `express-rate-limit` | Global: 200 req/15min per IP. Write ops: 10-20 req/min |
| Input Validation | Custom middleware | Type/range/length checks, NaN prevention, HTML tag stripping |
| XSS Prevention | HTML sanitization | `/<[^>]*>/g` regex removes HTML tags from all text inputs |
| Payload Limits | Express body-parser | 1MB body limit, 10MB for image uploads |
| File Validation | `multer` | 5MB max, JPEG/PNG/GIF/WebP only |
| Compression | `compression` | Gzip response compression |
| Logging | `morgan` | Combined format (production), dev format (local) |
| Graceful Shutdown | Custom SIGTERM handler | Clean server + DB pool shutdown for zero-downtime ECS deploys |

### Infrastructure-Level Security (from Lecture 6 - M09)

| Concept | Implementation |
|---|---|
| **Defense in Depth** | 3-layer security groups: ALB → ECS → RDS. Each layer only accepts traffic from the layer above. |
| **Network Isolation** | RDS in private-like configuration (only accessible from ECS security group, not internet) |
| **Encryption in Transit** | ALB handles HTTP traffic. In production, add ACM certificate for HTTPS (TLS termination at ALB). |
| **Encryption at Rest** | RDS supports encryption at rest (enabled by default for new instances). S3 uses server-side encryption. |
| **No Hardcoded Secrets** | Database credentials passed via ECS task definition environment variables. In production, use AWS Secrets Manager. |
| **Automated Deployments** | CodePipeline/CodeDeploy eliminates manual access to production servers. No SSH needed. |

---

## Budget Management ($50 Learner Lab)

### CRITICAL: Your $50 budget must last the entire project!

### Top Budget Killers to Avoid

1. **NAT Gateway** (~$1.08/day = $32/month!) — Use PUBLIC subnets with `assignPublicIp: ENABLED`
2. **RDS left running** (~$0.41/day) — RDS does NOT auto-stop when lab session ends!
3. **Forgetting to scale down ECS** (~$0.58/day for 2 tasks)
4. **Multiple ALBs** (~$0.54/day each) — Use 1 ALB with path-based routing
5. **Large RDS instance** — Always use `db.t3.micro`

### Budget-Saving Actions

#### Before Every Break / End of Day:
```bash
# 1. Scale ECS services to 0 (stops Fargate costs immediately)
aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 0
aws ecs update-service --cluster b2b-marketplace --service supplier-service --desired-count 0

# 2. Stop RDS instance (IMPORTANT — won't auto-stop!)
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
| Setup & Development (Cloud9) | 3 days | ~$0.50 | $1.50 |
| Deployment & Testing (all services running) | 5 days | ~$1.57 | $7.85 |
| Demo Day (everything running) | 1 day | ~$1.57 | $1.57 |
| Buffer | — | — | $10 |
| **TOTAL ESTIMATED** | | | **~$21** |
| **Remaining Safety Margin** | | | **~$29** |

---

## Demo Script (Saga Workflow)

### Step 0: Show AWS Infrastructure
1. Open **ECS Console** → Show running tasks for both services
2. Open **ALB Console** → Show listener rules (path-based routing: `/admin/*` → Supplier, default → Shop)
3. Open **Target Groups** → Show 4 target groups (blue/green pairs)
4. Open **CloudWatch** → Show log streams for `/ecs/shop` and `/ecs/supplier`
5. Open **S3 Console** → Show product images bucket
6. Open **CodePipeline** → Show pipeline stages and last execution
7. Explain: "We use **LabRole** for all service roles (ECS, CodeDeploy, CodePipeline) because Learner Lab does not allow custom IAM role creation."

### Step 1: Login & Registration
1. Open Shop login page (`http://<ALB-DNS>/login`) → Login as `shop1@b2bmarket.com` / `password123`
2. Show nav bar with user name, profile link, logout
3. Open Supplier login page (`http://<ALB-DNS>/admin/login`) → Login as `admin@b2bmarket.com` / `password123`
4. Optionally demo registration: Register new shop account → Show "pending approval" message
5. Explain: "All passwords are hashed with bcrypt. Sessions expire after 24 hours. Rate limiting prevents brute force."

### Step 2: Admin Approval (Admin Role)
1. Open Admin Dashboard (`/admin/manage`)
2. Show pending users → Approve a user
3. Show pending products → Approve a product listing
4. Explain: "New users and products require admin approval before going live"

### Step 3: Show Product Catalog (Shop Service)
1. Browse Products → Show product images (loaded from S3)
2. Click a product → Show detail page with "Send RFQ" button

### Step 4: RFQ → Quote → Contract Flow
1. **Shop**: Send RFQ on a product → Fill quantity and message → Submit
2. **Supplier**: Go to RFQs → Submit a quote (unit price, MOQ, delivery days)
3. **Shop**: Go to My RFQs → Accept the quote → Contract auto-created
4. **Supplier**: Go to Contracts → Confirm the contract

### Step 5: Create Order from Contract (Saga Step 1)
1. **Shop**: Go to Contracts → Click "Create Order from Contract"
2. Note the current stock level (e.g., 100)
3. Order created with stock deducted (stock: 90)

### Step 6: Confirm Order & Payment (Saga Steps 2-3)
1. **Supplier**: Go to Orders → Confirm the pending order
2. Process Payment (bank_transfer / qr_code / cod)
3. Status: pending → confirmed → paid

### Step 7: Demonstrate Failure Handling (Compensating Transaction)
1. Create another order (quantity: 5, stock goes from 90 to 85)
2. Confirm the order
3. Cancel the order from Supplier Panel
4. Show stock restored to 90 (**compensating transaction** — Saga pattern)

### Step 8: Demonstrate CI/CD (Update & Redeploy)
1. Make a small change in Cloud9 (e.g., update home page text)
2. Rebuild Docker image and push to ECR
3. Show CodePipeline automatically triggered
4. Show CodeDeploy blue/green deployment in progress
5. Show new version deployed after traffic switch

---

## Daily Checklist

### Before Starting Work
- [ ] Start lab session
- [ ] Start RDS instance (if stopped): `aws rds start-db-instance --db-instance-identifier b2bmarket-db`
- [ ] Wait 3-5 minutes for RDS to be available
- [ ] Scale ECS services to 1: `aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 1`
- [ ] Check budget in lab interface

### Before Stopping Work / End of Session
- [ ] **Scale ECS services to 0**: `aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 0`
- [ ] **Stop RDS instance**: `aws rds stop-db-instance --db-instance-identifier b2bmarket-db`
- [ ] Verify: no running ECS tasks, RDS status = "stopped"
- [ ] Check if any NAT Gateway exists → DELETE IT if found
- [ ] Check budget spent today

### Before Demo Day
- [ ] Start all services 30 minutes early
- [ ] Test all workflows (RFQ → Quote → Contract → Order → Payment → Cancel)
- [ ] Upload a test product image to verify S3
- [ ] Open CloudWatch logs to show monitoring
- [ ] Prepare screenshots for report

### After Demo (Project Complete)
- [ ] Delete ALL resources to preserve remaining budget:
```bash
# Delete ECS services
aws ecs delete-service --cluster b2b-marketplace --service shop-service --force
aws ecs delete-service --cluster b2b-marketplace --service supplier-service --force
# Delete ECS cluster
aws ecs delete-cluster --cluster b2b-marketplace
# Delete ALB and Target Groups (via console)
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
# Delete CodeDeploy application
aws deploy delete-application --application-name b2b-marketplace
# Delete CodePipeline pipelines
aws codepipeline delete-pipeline --name update-shop-service
aws codepipeline delete-pipeline --name update-supplier-service
# Delete CodeCommit repository
aws codecommit delete-repository --repository-name b2b-marketplace
```

---

## S3 Bucket Setup for Product Images

```bash
# Create bucket
aws s3 mb s3://b2b-marketplace-images --region us-east-1

# Disable block public access (required for public product images)
aws s3api put-public-access-block --bucket b2b-marketplace-images \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Set public read policy
aws s3api put-bucket-policy --bucket b2b-marketplace-images --policy '{
  "Version":"2012-10-17",
  "Statement":[{
    "Effect":"Allow",
    "Principal":"*",
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::b2b-marketplace-images/*"
  }]
}'
```
