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
- [Phase 9: Configuring CodeDeploy (Blue/Green Deployment)](#phase-9-configuring-codedeploy-blue-green-deployment)
- [Phase 10: Testing the CI/CD Deployment](#phase-10-testing-the-cicd-deployment)
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

- **Networking (VPC)**: VPC with 2 public subnets (use LabVPC if available, otherwise default VPC)
- **Database (Amazon RDS)**: MySQL 8.0 instance (`db.c6gd.medium`) within the VPC
- **User Access**: Application Load Balancer (ALB) receives requests on HTTP:80 and routes traffic
- **Compute (Amazon ECS/Fargate)**: ECS Cluster running Tasks for the Shop Microservice and Supplier Microservice
- **Storage (Amazon S3)**: Bucket for product images uploaded by suppliers
- **CI/CD**: CodeDeploy blue/green ECS deployments, triggered manually via CLI (CodePipeline not available in Learner Lab)
- **Monitoring**: Amazon CloudWatch for container logs and metrics
- **Development Environment**: AWS Cloud9 IDE

### Task 1.2: Develop a Cost Estimate

> **⚠️ Learner Lab Note**: AWS Pricing Calculator may not be accessible due to permission restrictions in Learner Lab. **Alternative**: Use the cost table below as your reference estimate. You can also create a **manual cost spreadsheet** (Excel/Google Sheets) using the pricing details from the [AWS Pricing pages](https://aws.amazon.com/pricing/) for each service — this achieves the same learning objective of understanding cloud cost estimation.

Access the [AWS Pricing Calculator](https://calculator.aws/) if available. Otherwise, use the table below. Select Region: **US East (N. Virginia) (us-east-1)**. Assume an operational time of **1 month** (Learner Lab budget):

| Service | Configuration | Pricing Detail | Cost/Hour | Cost/Day | Cost/Month |
|---|---|---|---|---|---|
| Amazon RDS (MySQL) | db.c6gd.medium, 20GB gp3, Single-AZ | ~$0.068/hr | $0.068 | $1.63 | $48.96 |
| Amazon ECS (Fargate) — Shop | 0.25 vCPU, 0.5GB RAM | vCPU: $0.04048/hr, Mem: $0.004445/GB/hr | $0.012 | $0.30 | $8.89 |
| Amazon ECS (Fargate) — Supplier | 0.25 vCPU, 0.5GB RAM | Same as above | $0.012 | $0.30 | $8.89 |
| Application Load Balancer | 1 ALB, ~0.5 LCU avg | $0.0225/hr + $0.008/LCU-hr | $0.027 | $0.64 | $19.44 |
| Amazon S3 | ~10MB product images | $0.023/GB/month | — | ~$0.00 | ~$0.01 |
| Amazon ECR | ~400MB Docker images (2 repos) | $0.10/GB/month | — | ~$0.01 | ~$0.04 |
| Amazon CloudWatch | Log storage (~1GB/month) | $0.50/GB ingested | — | ~$0.02 | ~$0.50 |
| AWS Cloud9 (t3.small) | Auto-stops after 30min idle | $0.0208/hr (only when active) | $0.021 | ~$0.08 | ~$2.50 |
| ~~AWS CodePipeline~~ | ~~2 pipelines~~ | Not available in Learner Lab | — | $0.00 | $0.00 |
| AWS CodeDeploy | ECS blue/green deployments | Free for ECS | $0.00 | $0.00 | $0.00 |
| AWS CodeCommit | 1 repo (free tier: 5 users) | Free | $0.00 | $0.00 | $0.00 |
| **TOTAL (all running)** | | | **$0.140** | **$3.36** | **$100+** |
| **TOTAL (ECS stopped, RDS stopped)** | | | **$0.027** | **$0.64** | — |

> **⚠️ BUDGET WARNING**: `db.c6gd.medium` costs ~$0.068/hr (~$1.63/day) — significantly more than the ideal `db.t3.micro` ($0.017/hr). **Always stop RDS when not in use** and minimize active hours. With careful management (RDS running only ~4 hours/day), you can keep RDS costs under $10 for the project.

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
     - VPC: Select **LabVPC** (if available; otherwise use the default VPC)
     - Subnet: Select **Public Subnet 1** (if available; otherwise select any public subnet with auto-assign public IP)

> **⚠️ Learner Lab Note**: In some Learner Lab environments, **LabVPC** and **Public Subnet 1** may not exist. If they are not available, use the **default VPC** and any **public subnet** instead. The rest of the guide will work the same way — just select the correct VPC/subnets consistently across all resources (ALB, RDS, ECS, etc.).

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

### Task 3.0: Add SSH inbound rule for Cloud9 (if needed)

If your Cloud9 environment uses SSH connection, ensure the Cloud9 EC2 instance's security group allows SSH:

1. In the **Amazon EC2** console → **Security Groups** → Find the Cloud9 instance security group
2. Select **Edit Inbound Rules** → **Add rule**:
   - Type: **SSH (TCP 22)**, Source: **Anywhere (0.0.0.0/0)** (or your IP for tighter security)
3. Select **Save rules**

### Task 3.1: Create an AWS CodeCommit repository

1. Open the **AWS CodeCommit** console
2. Select **Create repository**
3. **Repository name**: `b2b-marketplace`
4. **Description**: B2B Marketplace microservices project
5. Select **Create**

### Task 3.2: Clone the project code to Cloud9

Clone the project code from GitHub to Cloud9:

```bash
cd ~/environment
git clone https://github.com/AsakiIchiwa/AWS_LAB.git
cd AWS_LAB
```

> **Note**: The cloned directory is `AWS_LAB`. All subsequent commands in this guide use `cd ~/environment/AWS_LAB` instead of `cd ~/environment/b2b-marketplace`.

### Task 3.3: Verify the project structure

```bash
cd ~/environment/AWS_LAB
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
cd ~/environment/AWS_LAB

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
cd ~/environment/AWS_LAB

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
cd ~/environment/AWS_LAB/microservices/shop

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

Test: Use **Cloud9 Preview** (Tools → Preview → Preview Running Application) or access `http://<Cloud9-Public-IP>:8080` in a browser. Confirm:
- Login page loads at `/login`
- Health check works at `/health`

> **⚠️ Learner Lab Note**: Direct access via public IP may be blocked by security groups. Use **Cloud9 Preview** instead: click **Preview** → **Preview Running Application** in the Cloud9 menu bar. Append the port path if needed (e.g., `/health`).

### Task 4.4: Build and test the Supplier microservice

```bash
cd ~/environment/AWS_LAB/microservices/supplier

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

Test: Use **Cloud9 Preview** or access `http://<Cloud9-Public-IP>:8081/admin/login` in a browser. Confirm:
- Supplier login page loads
- Admin dashboard accessible after login

> **Tip**: For Cloud9 Preview on port 8081, change the preview URL port from 8080 to 8081.

### Task 4.5: Clean up test containers

```bash
docker rm -f shop_1 supplier_1 mysql-test
```

### Task 4.6: Commit and push code to CodeCommit

```bash
cd ~/environment/AWS_LAB
git add .
git commit -m "Verified: both microservices build and run correctly in Docker"
git push codecommit main
```

---

## Phase 5: Creating ECR Repositories, ECS Cluster, Task Definitions, and AppSpec Files

### Task 5.1: Create ECR repositories and push Docker images

```bash
# Navigate to project directory
cd ~/environment/AWS_LAB

# Build Docker images first (services are inside microservices/)
docker build -t shop ./microservices/shop
docker build -t supplier ./microservices/supplier

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

> **⚠️ Learner Lab Note**: If creating the cluster via the console fails with a permissions error, use the CLI instead:
> ```bash
> aws ecs create-cluster --cluster-name b2b-marketplace
> ```

### Task 5.3: Create task definition files and register them

The task definition files are already in the `deployment/` directory. You need to update the placeholder values.

```bash
cd ~/environment/AWS_LAB/deployment

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

Keep the `image` field as `<IMAGE1_NAME>` in both task definitions. The deploy script (Phase 9) will replace this placeholder with the actual ECR image URI during deployment.

```bash
cd ~/environment/AWS_LAB
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
   - **DB instance class**: `db.c6gd.medium` (Note: `db.t3.micro` may not be available in Learner Lab)
   - **Storage**: 20 GB gp3 (Note: `gp2` may not be available; use `gp3`), disable auto-scaling
   - **Multi-AZ**: **NO** (saves cost)
   - **VPC**: LabVPC (or default VPC if LabVPC is not available)
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

> **⚠️ Learner Lab Note**: To connect to RDS from Cloud9, go to the RDS console → select your DB instance → **Connected compute resources** → **Set up EC2 connection** → select your Cloud9 EC2 instance. This automatically configures the security groups for connectivity.

```bash
# Get the RDS endpoint
# Go to RDS Console → Databases → b2bmarket-db → Copy the Endpoint

# Connect to the database from Cloud9
mysql -h <RDS-ENDPOINT> -u admin -p
# Enter password: lab-password

# Verify connection
SHOW DATABASES;

# Create the database if it doesn't exist (if you didn't set initial database name during creation)
CREATE DATABASE IF NOT EXISTS b2bmarket;
USE b2bmarket;

# Exit MySQL
exit
```

Load the schema and seed data:
```bash
mysql -h <RDS-ENDPOINT> -u admin -plab-password b2bmarket < ~/environment/AWS_LAB/deployment/db-init.sql
```

Verify (note: you must include `-u admin -plab-password` and the database name):
```bash
mysql -h <RDS-ENDPOINT> -u admin -plab-password b2bmarket -e "SHOW TABLES;"
```

You should see tables: `users`, `products`, `rfqs`, `quotes`, `contracts`, `orders`, `payments`.

### Task 6.4: Update task definitions with the RDS endpoint

```bash
cd ~/environment/AWS_LAB/deployment

# Replace the placeholder in both task definition files
# Use the actual RDS endpoint (e.g., b2bmarket-db.cxxxxx.us-east-1.rds.amazonaws.com)
sed -i 's/<RDS-ENDPOINT>/b2bmarket-db.cxxxxx.us-east-1.rds.amazonaws.com/g' taskdef-shop.json taskdef-supplier.json
```

> **Note**: Replace `b2bmarket-db.cxxxxx.us-east-1.rds.amazonaws.com` with your actual RDS endpoint.
```

---

## Phase 7: Creating Target Groups and an Application Load Balancer

### Task 7.1: Create a security group for the ALB and ECS tasks

In the **EC2** console → **Security Groups** → **Create Security Group**:

**Security Group 1: ALB Security Group**
- **Name**: `b2b-alb-sg`
- **VPC**: LabVPC (or your chosen VPC)
- **Inbound Rules**:
  - Type: **HTTP (TCP 80)**, Source: **Anywhere (0.0.0.0/0)**
- **Outbound Rules**: Default (all traffic)

**Security Group 2: ECS Tasks Security Group**
- **Name**: `b2b-ecs-sg`
- **VPC**: LabVPC (or your chosen VPC)
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
| `shop-tg-one` | IP addresses | 8080 | Your VPC | `/health` |
| `shop-tg-two` | IP addresses | 8080 | Your VPC | `/health` |
| `supplier-tg-one` | IP addresses | 8080 | Your VPC | `/health` |
| `supplier-tg-two` | IP addresses | 8080 | Your VPC | `/health` |

For each target group:
1. Select **IP addresses** as the target type
2. Protocol: **HTTP**, Port: **8080**
3. VPC: **Your VPC** (LabVPC or default VPC)
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
   - **VPC**: Your VPC (LabVPC or default VPC)
   - **Mappings**: Select **2 public subnets** (Public Subnet 1 and Public Subnet 2, or any 2 public subnets in your VPC)
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
cd ~/environment/AWS_LAB/deployment
```

Replace the following placeholders:
- `<REVISION-NUMBER>` → Get from **ECS Console** → **Task Definitions** → `shop` → Note the latest revision number
- `<ARN-shop-tg-two>` → Get from **EC2** → **Target Groups** → `shop-tg-two` → Copy the ARN
- `<PUBLIC-SUBNET-1-ID>` and `<PUBLIC-SUBNET-2-ID>` → Get from **VPC** → **Subnets** → Copy the Public Subnet IDs (use the same subnets you chose for ALB)
- `<B2B-ECS-SG-ID>` → Get from **EC2** → **Security Groups** → `b2b-ecs-sg` → Copy the Security Group ID

> **⚠️ Important**: The JSON files have `"deploymentController": {"type": "CODE_DEPLOY"}`. If you plan to use the **Manual ECS Rolling Deployment** alternative (Phase 9), change this to `"type": "ECS"` in both JSON files **before creating the services**. You cannot change the deployment controller after service creation.

Edit `create-supplier-microservice-tg-two.json`:
- Same subnet and security group values
- Change ARN to `supplier-tg-two`
- Change containerName to `supplier`
- Change taskDefinition to `supplier:<REVISION-NUMBER>`

### Task 8.2: Create the ECS service for the Shop microservice

```bash
cd ~/environment/AWS_LAB/deployment
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

## Phase 9: Configuring CodeDeploy (Blue/Green Deployment)

> **⚠️ IMPORTANT: CodeBuild and CodePipeline are NOT available in AWS Academy Learner Lab.** Docker images are built and pushed to ECR manually from Cloud9. CodeDeploy blue/green deployments are triggered via CLI.

> **⚠️ Learner Lab IAM Note**: If you encounter IAM/permission errors when creating CodeDeploy resources via the **console**, try the **CLI alternative** provided for each step.

### Task 9.1: Create a CodeDeploy application

**Option A: Console**
1. Open the **CodeDeploy** console
2. Select **Create application**
3. **Application name**: `b2b-marketplace`
4. **Compute platform**: **Amazon ECS**
5. Select **Create application**

**Option B: CLI (if console fails)**
```bash
aws deploy create-application --application-name b2b-marketplace --compute-platform ECS
```

### Task 9.2: Create a deployment group for the Shop microservice

**Option A: Console**
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

**Option B: CLI (if console fails)**
```bash
# Get required values
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)

# Get target group ARNs
shop_tg_one_arn=$(aws elbv2 describe-target-groups --names shop-tg-one --query 'TargetGroups[0].TargetGroupArn' --output text)
shop_tg_two_arn=$(aws elbv2 describe-target-groups --names shop-tg-two --query 'TargetGroups[0].TargetGroupArn' --output text)

# Get ALB listener ARN
alb_arn=$(aws elbv2 describe-load-balancers --names b2b-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text)
listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn $alb_arn --query 'Listeners[0].ListenerArn' --output text)

aws deploy create-deployment-group \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-shop-dg \
  --service-role-arn arn:aws:iam::${account_id}:role/LabRole \
  --deployment-config-name CodeDeployDefault.ECSAllAtOnce \
  --ecs-services clusterName=b2b-marketplace,serviceName=shop-service \
  --load-balancer-info "targetGroupPairInfoList=[{targetGroups=[{name=shop-tg-two},{name=shop-tg-one}],prodTrafficRoute={listenerArns=[$listener_arn]}}]" \
  --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL \
  --blue-green-deployment-configuration "terminateBlueInstancesOnDeploymentSuccess={action=TERMINATE,terminationWaitTimeInMinutes=5},deploymentReadyOption={actionOnTimeout=CONTINUE_DEPLOYMENT}"
```

### Task 9.3: Create a deployment group for the Supplier microservice

Repeat the same steps (console or CLI) with:
- **Deployment group name**: `b2b-supplier-dg`
- **ECS service name**: Select `supplier-service`
- **Target group 1 name**: Select `supplier-tg-two`
- **Target group 2 name**: Select `supplier-tg-one`

### Task 9.4: Trigger CodeDeploy Blue/Green Deployment via CLI (replaces CodePipeline)

> **⚠️ Learner Lab Note**: CodePipeline is **not available** in Learner Lab due to IAM restrictions. Instead, we trigger CodeDeploy blue/green deployments **directly from the CLI**. This achieves the same blue/green deployment result — the only difference is the trigger is manual instead of automated by a pipeline.

**Deploy the Shop microservice:**

```bash
cd ~/environment/AWS_LAB

# Get account ID and set variables
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)

# Step 1: Update the task definition with the actual ECR image URI
# (Replace <IMAGE1_NAME> with the real image URI)
sed -i "s|<IMAGE1_NAME>|$account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest|g" deployment/taskdef-shop.json

# Step 2: Register the updated task definition and get the new revision ARN
SHOP_TASKDEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://deployment/taskdef-shop.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Shop Task Definition ARN: $SHOP_TASKDEF_ARN"

# Step 3: Update the appspec to use the new task definition ARN
sed -i "s|<TASK_DEFINITION>|$SHOP_TASKDEF_ARN|g" deployment/appspec-shop.yaml

# Step 4: Create the CodeDeploy deployment
aws deploy create-deployment \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-shop-dg \
  --revision '{"revisionType":"AppSpecContent","appSpecContent":{"content":"'"$(cat deployment/appspec-shop.yaml | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" | tr -d '"')"'"}}' \
  --description "Deploy shop service via CLI"
```

> **Note**: If the `--revision` inline approach is too complex, you can upload the AppSpec to S3 instead:
> ```bash
> # Upload appspec to S3
> aws s3 cp deployment/appspec-shop.yaml s3://b2b-marketplace-images/deploy/appspec-shop.yaml
>
> # Create deployment from S3
> aws deploy create-deployment \
>   --application-name b2b-marketplace \
>   --deployment-group-name b2b-shop-dg \
>   --s3-location bucket=b2b-marketplace-images,key=deploy/appspec-shop.yaml,bundleType=YAML
> ```

**Deploy the Supplier microservice:**

```bash
# Step 1: Update task definition with ECR image URI
sed -i "s|<IMAGE1_NAME>|$account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest|g" deployment/taskdef-supplier.json

# Step 2: Register and get revision ARN
SUPPLIER_TASKDEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://deployment/taskdef-supplier.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Supplier Task Definition ARN: $SUPPLIER_TASKDEF_ARN"

# Step 3: Update appspec
sed -i "s|<TASK_DEFINITION>|$SUPPLIER_TASKDEF_ARN|g" deployment/appspec-supplier.yaml

# Step 4: Create deployment
aws deploy create-deployment \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-supplier-dg \
  --revision '{"revisionType":"AppSpecContent","appSpecContent":{"content":"'"$(cat deployment/appspec-supplier.yaml | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" | tr -d '"')"'"}}' \
  --description "Deploy supplier service via CLI"
```

### Task 9.5: Monitor the CodeDeploy deployment

```bash
# List recent deployments
aws deploy list-deployments --application-name b2b-marketplace --output table

# Get deployment status (replace <DEPLOYMENT-ID> with actual ID from above)
aws deploy get-deployment --deployment-id <DEPLOYMENT-ID> \
  --query 'deploymentInfo.status' --output text
```

You can also monitor in the **CodeDeploy Console** → **Deployments** → Watch the blue/green traffic shift.

### Task 9.6: Create a reusable deployment script (optional)

To simplify future deployments, save this as `deploy.sh` in the project root:

```bash
#!/bin/bash
# Usage: ./deploy.sh shop   OR   ./deploy.sh supplier

SERVICE=$1
if [ -z "$SERVICE" ]; then
  echo "Usage: ./deploy.sh <shop|supplier>"
  exit 1
fi

account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)
IMAGE_URI="$account_id.dkr.ecr.us-east-1.amazonaws.com/$SERVICE:latest"

echo "=== Building $SERVICE ==="
cd ~/environment/AWS_LAB/microservices/$SERVICE
docker build -t $SERVICE .

echo "=== Pushing to ECR ==="
docker tag $SERVICE:latest $IMAGE_URI
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com
docker push $IMAGE_URI

echo "=== Registering new task definition ==="
cd ~/environment/AWS_LAB/deployment
# Create a temp copy to avoid modifying the original
cp taskdef-$SERVICE.json /tmp/taskdef-$SERVICE-deploy.json
sed -i "s|<IMAGE1_NAME>|$IMAGE_URI|g" /tmp/taskdef-$SERVICE-deploy.json
sed -i "s|<ACCOUNT-ID>|$account_id|g" /tmp/taskdef-$SERVICE-deploy.json

TASKDEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/taskdef-$SERVICE-deploy.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "New Task Definition: $TASKDEF_ARN"

echo "=== Creating CodeDeploy deployment ==="
# Create temp appspec with actual task def ARN
cp appspec-$SERVICE.yaml /tmp/appspec-$SERVICE-deploy.yaml
sed -i "s|<TASK_DEFINITION>|$TASKDEF_ARN|g" /tmp/appspec-$SERVICE-deploy.yaml

# Upload to S3 and deploy
aws s3 cp /tmp/appspec-$SERVICE-deploy.yaml s3://b2b-marketplace-images/deploy/appspec-$SERVICE.yaml
DEPLOYMENT_ID=$(aws deploy create-deployment \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-$SERVICE-dg \
  --s3-location bucket=b2b-marketplace-images,key=deploy/appspec-$SERVICE.yaml,bundleType=YAML \
  --query 'deploymentId' --output text)

echo "=== Deployment started: $DEPLOYMENT_ID ==="
echo "Monitor at: https://console.aws.amazon.com/codedeploy/home?region=us-east-1#/deployments/$DEPLOYMENT_ID"
```

Make it executable: `chmod +x ~/environment/AWS_LAB/deploy.sh`

Usage:
```bash
./deploy.sh shop      # Build, push, and deploy shop service
./deploy.sh supplier  # Build, push, and deploy supplier service
```

### How the CI/CD Deployment Works

```
Developer makes code changes in Cloud9
        │
        ▼
Builds Docker image locally (docker build)
        │
        ▼
Tags and pushes new image to ECR (shop:latest or supplier:latest)
        │
        ▼
Registers new ECS task definition with updated image URI
        │
        ▼
Triggers CodeDeploy blue/green deployment via CLI
(or uses deploy.sh script for automation)
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

> **Note**: In a production environment, CodePipeline would automate steps 2-5 (triggered by ECR image push). In Learner Lab, CodePipeline is not available, so we trigger CodeDeploy manually via CLI — achieving the same blue/green deployment result.

---

## Phase 10: Testing the CI/CD Deployment

### Task 10.1: Make a code change

```bash
cd ~/environment/AWS_LAB/microservices/shop

# Make a visible change (e.g., update the home page title)
# Edit views/home.ejs — change any visible text
```

### Task 10.2: Build, push, and deploy using the deploy script

**Option A: Using the deploy script (recommended)**
```bash
cd ~/environment/AWS_LAB
chmod +x deploy.sh
./deploy.sh shop
```

**Option B: Manual steps**
```bash
# Rebuild the Shop image
cd ~/environment/AWS_LAB/microservices/shop
docker build --tag shop .

# Tag and push to ECR
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)
docker tag shop:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest

aws ecr get-login-password --region us-east-1 | docker login --username AWS \
  --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com

docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest

# Then trigger CodeDeploy (see Task 9.4 for full commands)
```

### Task 10.3: Monitor the CodeDeploy deployment

1. Open the **CodeDeploy** console → **Deployments** → Watch the blue/green deployment progress
2. Or use CLI:
```bash
# List recent deployments
aws deploy list-deployments --application-name b2b-marketplace \
  --deployment-group-name b2b-shop-dg --output table

# Check specific deployment status
aws deploy get-deployment --deployment-id <DEPLOYMENT-ID> \
  --query 'deploymentInfo.[status,deploymentOverview]' --output table
```
3. Wait for deployment to complete (typically 3-5 minutes)

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
| ~~**CodePipeline Service Role**~~ | ~~`LabRole`~~ | ~~Orchestrate pipeline stages~~ | Not available in Learner Lab — CodeDeploy triggered via CLI instead |
| **Cloud9 EC2 Instance** | `LabInstanceProfile` | AWS CLI commands, Docker push to ECR | Instance profile — attached to EC2 for AWS API access |

### IAM Concepts Applied (from Lecture 6 - M03)

| Concept | How It's Applied in This Project |
|---|---|
| **Principle of Least Privilege** | Security groups restrict access layer-by-layer (ALB → ECS → RDS). In production, each service would have its own role with minimal permissions. |
| **IAM Roles (not users) for services** | ECS tasks and CodeDeploy use IAM roles (LabRole), not long-term credentials. This follows AWS best practice. |
| **Shared Responsibility Model** | AWS manages infrastructure security (hardware, networking, managed services). We manage application security (authentication, input validation, security groups, encryption in transit). |
| **Temporary Credentials** | ECS tasks receive temporary security credentials via the task role. Credentials rotate automatically — no static access keys needed. |
| **Identity-Based Policies** | LabRole has an identity-based policy attached that grants permissions to AWS services. In production, you would create specific policies per service. |
| **Permission Boundaries** | Learner Lab enforces permission boundaries: region limited to `us-east-1`/`us-west-2`, instance types limited, no IAM modifications. |

### Application-Level Role-Based Access Control (RBAC)

Since Learner Lab does not allow custom IAM users/groups/roles, role-based access control is implemented **at the application level** using middleware. This mirrors IAM concepts (users, groups, policies) within the application code:

| IAM Concept | Application Equivalent | Implementation |
|---|---|---|
| **IAM Users** | `users` table in MySQL | Each user has `id`, `email`, `password_hash`, `role`, `status` |
| **IAM Groups** | `role` field: `shop`, `supplier`, `admin` | Three roles with different permission sets |
| **IAM Policies** | Express middleware | `requireAuth` (identity-based) and `requireAdmin` (resource-based) |
| **Authentication** | `bcryptjs` + `express-session` | Like IAM login — verify identity before granting access |
| **Authorization** | Role checks in middleware | Like IAM policy evaluation — check if role allows the action |
| **Least Privilege** | Each role only accesses its own routes | Shop can't access `/admin/*`, Supplier can't access Shop-only routes |

#### Role Permissions Matrix

| Permission | Shop (Buyer) | Supplier (Seller) | Admin |
|---|---|---|---|
| Browse products | ✅ | ❌ | ❌ |
| Send RFQ | ✅ | ❌ | ❌ |
| Accept/Reject quotes | ✅ | ❌ | ❌ |
| Create orders | ✅ | ❌ | ❌ |
| Manage products (CRUD + S3 images) | ❌ | ✅ | ❌ |
| Submit quotes | ❌ | ✅ | ❌ |
| Confirm/Cancel orders | ❌ | ✅ | ❌ |
| Process payments | ❌ | ✅ | ❌ |
| Approve/Reject users | ❌ | ❌ | ✅ |
| Approve/Reject products | ❌ | ❌ | ✅ |
| View all RFQs/Contracts | ❌ | ❌ | ✅ |
| System dashboard | ❌ | ❌ | ✅ |

#### How It Works in Code

```javascript
// Shop Service — Authentication middleware (like IAM identity verification)
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login'); // No identity → deny (shop login)
  next(); // Identity verified → proceed
};

// Supplier Service — Authentication middleware (redirects to supplier's own login)
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/admin/login'); // No identity → deny (supplier login)
  if (req.session.user.role !== 'supplier' && req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'Access denied. Supplier or Admin account required.' });
  }
  next(); // Identity verified + correct role → proceed
};

// Supplier Service — Authorization middleware (like IAM policy: "Effect: Allow, Action: admin:*")
const requireAdmin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/admin/login');
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'Access denied. Admin role required.' });
  }
  next(); // Role = admin → allow
};

// Route-level access control (like IAM resource-based policies)
app.get('/admin/manage', requireAdmin, adminController.dashboard);
// Only authenticated users with admin role can access this route
```

#### ALB Path-Based Routing as Network-Level RBAC

The ALB listener rules act as a **network-level access control layer**, similar to IAM resource policies:

| ALB Rule | Effect | Analogous IAM Concept |
|---|---|---|
| Path `/admin/*` → Supplier service | Only supplier/admin users reach the Supplier service | Resource-based policy: only certain principals can access the resource |
| Default `/*` → Shop service | Shop users reach the Shop service | Default allow for authenticated principals |

This creates **two layers of access control**: ALB routes traffic to the correct service, then the application middleware verifies the user's role.

### Production IAM Recommendations (Beyond Learner Lab)

In a real production environment, you would create separate IAM roles per service following least privilege. Each role would only have the minimum AWS permissions needed:

#### ECS Task Roles (per microservice)

**Shop Service Task Role** (`shopTaskRole`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["rds-db:connect"],
      "Resource": "arn:aws:rds-db:us-east-1:<ACCOUNT_ID>:dbuser:*/admin"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::b2b-marketplace-images/*"
    }
  ]
}
```
> Shop only needs to **read** product images from S3 and **connect** to RDS. No S3 write access.

**Supplier Service Task Role** (`supplierTaskRole`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["rds-db:connect"],
      "Resource": "arn:aws:rds-db:us-east-1:<ACCOUNT_ID>:dbuser:*/admin"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::b2b-marketplace-images/*"
    }
  ]
}
```
> Supplier needs S3 **write** access to upload/delete product images, plus read and RDS connect.

#### CI/CD Service Roles

| Role | Permissions |
|---|---|
| `ecsTaskExecutionRole` | `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `logs:CreateLogStream`, `logs:PutLogEvents` |
| `codeDeployRole` | `ecs:*`, `elasticloadbalancing:*`, `iam:PassRole` |
| ~~`codePipelineRole`~~ | ~~Not available in Learner Lab~~ |

#### IAM Users and Groups (for team members)

| IAM Group | Members | Policies |
|---|---|---|
| `Developers` | Team members who write code | CodeCommit push/pull, ECR push, Cloud9 access |
| `DevOps` | Team members who manage infrastructure | Full ECS/ALB/RDS/CodeDeploy access |
| `ReadOnly` | Reviewers, project managers | ViewOnly access to all resources |

> **In Learner Lab**: All of this is handled by the single `LabRole`. The application-level RBAC (shop/supplier/admin middleware) compensates for the inability to create per-service IAM roles.

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
| **Automated Deployments** | CodeDeploy blue/green deployments eliminate manual access to production servers. No SSH needed. Deploy script automates the CLI workflow. |

---

## Budget Management ($50 Learner Lab)

### CRITICAL: Your $50 budget must last the entire project!

### Top Budget Killers to Avoid

1. **NAT Gateway** (~$1.08/day = $32/month!) — Use PUBLIC subnets with `assignPublicIp: ENABLED`
2. **RDS left running** (~$0.41/day) — RDS does NOT auto-stop when lab session ends!
3. **Forgetting to scale down ECS** (~$0.58/day for 2 tasks)
4. **Multiple ALBs** (~$0.54/day each) — Use 1 ALB with path-based routing
5. **Large RDS instance** — Use `db.c6gd.medium` (smallest available in Learner Lab; `db.t3.micro` may not be available). **Stop RDS when not working** — this instance costs ~$1.63/day!

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

> **Key insight**: ALB charges ~$0.64/day even when ECS is stopped. Only delete ALB if budget is critical.

| Phase | What's Running | Days | Daily Cost | Total |
|---|---|---|---|---|
| **Setup** (Cloud9 + RDS only) | Cloud9, RDS | 2 days | ~$1.71 | $3.42 |
| **Deploy & Test** (all services) | RDS, 2×ECS, ALB, Cloud9 | 3 days | ~$3.36 | $10.08 |
| **Idle** (ALB + stopped services) | ALB only (ECS=0, RDS stopped) | 10 days | ~$0.64 | $6.40 |
| **Demo Day** (everything running) | All services | 1 day | ~$3.36 | $3.36 |
| **Buffer for unexpected costs** | — | — | — | $10.00 |
| **TOTAL ESTIMATED** | | | | **~$33** |
| **Remaining from $50** | | | | **~$17** |

> **💡 Budget Tip**: To save money, keep RDS running only when actively working (start/stop manually). During Setup phase, run RDS for just 2-3 hours for DB init, then stop it. This can cut Setup costs to ~$0.50.

---

## Demo Script (Saga Workflow)

### Step 0: Show AWS Infrastructure
1. Open **ECS Console** → Show running tasks for both services
2. Open **ALB Console** → Show listener rules (path-based routing: `/admin/*` → Supplier, default → Shop)
3. Open **Target Groups** → Show 4 target groups (blue/green pairs)
4. Open **CloudWatch** → Show log streams for `/ecs/shop` and `/ecs/supplier`
5. Open **S3 Console** → Show product images bucket
6. Open **CodeDeploy** → Show deployment history and blue/green status
7. Explain: "We use **LabRole** for all service roles (ECS, CodeDeploy) because Learner Lab does not allow custom IAM role creation. CodePipeline is not available, so we trigger deployments via CLI."

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
1. **Shop**: Send RFQ on a product → Fill quantity and note → Submit
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
3. Run `./deploy.sh shop` to trigger CodeDeploy
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
# Delete CodePipeline pipelines (skip if never created)
# aws codepipeline delete-pipeline --name update-shop-service
# aws codepipeline delete-pipeline --name update-supplier-service
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
