# B2B Marketplace - Deployment Guide (GitHub Actions CI/CD)

> **Phiên bản này thay thế CodePipeline/CodeBuild (bị restrict trên Learner Lab) bằng GitHub Actions.** Khi push code lên GitHub, GitHub Actions sẽ tự động build Docker, push lên ECR, và trigger CodeDeploy Blue/Green deployment — hoàn toàn tự động, không cần chạy lệnh thủ công.

## Table of Contents

- [Tổng quan kiến trúc CI/CD](#tổng-quan-kiến-trúc-cicd)
- [Phase 1: Lập kế hoạch và ước tính chi phí](#phase-1-lập-kế-hoạch-và-ước-tính-chi-phí)
- [Phase 2: Thiết lập môi trường Development (Cloud9)](#phase-2-thiết-lập-môi-trường-development-cloud9)
- [Phase 3: Tạo GitHub Repository và push code](#phase-3-tạo-github-repository-và-push-code)
- [Phase 4: Build và test Microservices trên Docker (Local)](#phase-4-build-và-test-microservices-trên-docker-local)
- [Phase 5: Tạo ECR, ECS Cluster, Task Definitions](#phase-5-tạo-ecr-ecs-cluster-task-definitions)
- [Phase 6: Tạo Database (Amazon RDS)](#phase-6-tạo-database-amazon-rds)
- [Phase 7: Tạo Target Groups và Application Load Balancer](#phase-7-tạo-target-groups-và-application-load-balancer)
- [Phase 8: Tạo ba ECS Services](#phase-8-tạo-ba-ecs-services)
- [Phase 9: Cấu hình CodeDeploy (Blue/Green Deployment)](#phase-9-cấu-hình-codedeploy-bluegreen-deployment)
- [Phase 10: Cấu hình GitHub Actions CI/CD](#phase-10-cấu-hình-github-actions-cicd)
- [Phase 11: Test CI/CD Pipeline](#phase-11-test-cicd-pipeline)
- [Phase 12: CloudWatch Monitoring](#phase-12-cloudwatch-monitoring)
- [Quản lý ngân sách ($50 Learner Lab)](#quản-lý-ngân-sách-50-learner-lab)
- [Demo Script](#demo-script)
- [Daily Checklist](#daily-checklist)
- [Xử lý sự cố](#xử-lý-sự-cố)

---

## Tổng quan kiến trúc CI/CD

### So sánh: Trước vs Sau khi dùng GitHub Actions

| Thành phần | Trước (Manual) | Sau (GitHub Actions) |
|---|---|---|
| **Source Control** | GitHub + CodeCommit | GitHub (duy nhất) |
| **Build** | Chạy `docker build` thủ công trên Cloud9 | GitHub Actions tự động build |
| **Push Image** | Chạy `docker push` thủ công | GitHub Actions tự động push ECR |
| **Deploy** | Chạy `./deploy.sh` thủ công | GitHub Actions tự động trigger CodeDeploy |
| **Trigger** | Người dùng chạy lệnh | Push code lên `main` branch |

### Flow CI/CD hoàn chỉnh

```
Developer push code lên GitHub (main branch)
        │
        ▼
GitHub Actions tự động trigger
        │
        ├─── Detect changed services (shop? supplier? auth? shared?)
        │
        ▼ (chỉ build service bị thay đổi)
Build Docker image trên GitHub Runner
        │
        ▼
Push image lên Amazon ECR (tag: latest + commit SHA)
        │
        ▼
Register Task Definition mới trên ECS
        │
        ▼
Trigger CodeDeploy Blue/Green Deployment
        │
        ▼
CodeDeploy tạo ECS tasks mới trong standby target group
        │
        ▼
Health check pass → ALB chuyển traffic sang tasks mới
        │
        ▼
Tasks cũ bị terminate sau 5 phút
```

### Kiến trúc tổng quan

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           GITHUB                                        │
│  ┌─────────────┐    ┌──────────────────────────────────────────────┐     │
│  │ GitHub Repo │───>│ GitHub Actions Workflow                      │     │
│  │ (main)      │    │  1. Detect changes                           │     │
│  └─────────────┘    │  2. Build Docker images                      │     │
│                     │  3. Push to ECR                               │     │
│                     │  4. Register Task Definition                  │     │
│                     │  5. Trigger CodeDeploy                       │     │
│                     └──────────────────────┬───────────────────────┘     │
└────────────────────────────────────────────┼─────────────────────────────┘
                                             │ AWS API calls
                                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           AWS (us-east-1)                                │
│                                                                          │
│  ┌────────┐    ┌──────────────┐    ┌───────────────────────────────┐     │
│  │  ECR   │───>│  CodeDeploy  │───>│  ECS Fargate (Blue/Green)     │     │
│  │ Images │    │  Blue/Green  │    │  ├── shop-service     (8080)  │     │
│  └────────┘    └──────────────┘    │  ├── supplier-service (8080)  │     │
│                                    │  └── auth-service     (8082)  │     │
│                                    └──────────────┬────────────────┘     │
│                                                   │                      │
│  ┌─────────────┐    ┌──────────┐    ┌─────────────┘                     │
│  │  S3 Bucket  │    │   ALB    │<───┘                                   │
│  │  (Images)   │    │ (HTTP:80)│                                        │
│  └─────────────┘    └──────────┘                                        │
│                                                                          │
│  ┌──────────────┐    ┌────────────────┐                                 │
│  │  RDS MySQL   │    │  CloudWatch    │                                 │
│  │  (3 schemas) │    │  (Logs/Metrics)│                                 │
│  └──────────────┘    └────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Lập kế hoạch và ước tính chi phí

### Task 1.1: Hiểu kiến trúc hệ thống

Hệ thống B2B Marketplace gồm 3 microservices:

| Service | Port | Database | Chức năng |
|---|---|---|---|
| **Shop** | 8080 | `shop_db` | Giao diện mua hàng (RFQ, Order, Contract) |
| **Supplier** | 8080 | `supplier_db` | Quản lý sản phẩm, báo giá, hợp đồng |
| **Auth** | 8082 | `auth_db` | Xác thực, quản lý user |

Các dịch vụ AWS sử dụng:

| Dịch vụ AWS | Mục đích |
|---|---|
| **Amazon ECS Fargate** | Chạy containers (serverless, không cần EC2) |
| **Amazon ECR** | Lưu trữ Docker images |
| **Amazon RDS (MySQL 8.0)** | Database |
| **Application Load Balancer** | Routing traffic dựa trên URL path |
| **Amazon S3** | Lưu trữ hình ảnh sản phẩm + AppSpec files |
| **AWS CodeDeploy** | Blue/Green deployment |
| **Amazon CloudWatch** | Logs và monitoring |
| **AWS Cloud9** | IDE development trên cloud |
| **GitHub Actions** | CI/CD pipeline (thay thế CodePipeline/CodeBuild) |

### Task 1.2: Ước tính chi phí

| Service | Cấu hình | Chi phí/ngày | Chi phí/tháng |
|---|---|---|---|
| Amazon RDS (MySQL) | db.c6gd.medium, 20GB gp3 | $1.63 | $48.96 |
| Amazon ECS (Fargate) × 3 | 0.25 vCPU, 0.5GB RAM mỗi service | $0.90 | $26.67 |
| Application Load Balancer | 1 ALB | $0.64 | $19.44 |
| Amazon S3 | ~10MB images | ~$0.00 | ~$0.01 |
| Amazon ECR | ~600MB images (3 repos) | ~$0.00 | ~$0.06 |
| CloudWatch | ~1GB logs | ~$0.02 | ~$0.50 |
| Cloud9 (t3.small) | Auto-stop sau 30 phút | ~$0.08 | ~$2.50 |
| GitHub Actions | Free cho public repo, 2000 min/month cho private | $0.00 | $0.00 |
| CodeDeploy | Free cho ECS | $0.00 | $0.00 |
| **TỔNG (tất cả chạy)** | | **$3.36** | **$100+** |
| **TỔNG (ECS停止, RDS停止)** | | **$0.64** | — |

> ⚠️ **CẢNH BÁO BUDGET**: Với $50 Learner Lab, bạn **PHẢI** dừng RDS và scale ECS về 0 khi không sử dụng. **KHÔNG BAO GIỜ** tạo NAT Gateway (~$1.08/ngày).

---

## Phase 2: Thiết lập môi trường Development (Cloud9)

### Task 2.1: Tạo Cloud9 IDE

1. Trong AWS Console, tìm **Cloud9**
2. Bấm **Create environment**
3. Cấu hình:
   - **Name**: `B2BMarketplaceIDE`
   - **Environment type**: New EC2 instance
   - **Instance type**: `t3.small`
   - **Platform**: Amazon Linux 2
   - **Connection**: Select **Secure Shell (SSH)**
   - **VPC**: Select **LabVPC** (hoặc default VPC nếu không có LabVPC)
   - **Subnet**: Select **Public Subnet 1** (hoặc bất kỳ public subnet nào)
4. Bấm **Create** → Đợi environment sẵn sàng → Bấm **Open**

> ⚠️ **Learner Lab Note**: Nếu không thấy LabVPC, dùng **default VPC**. Đảm bảo dùng cùng VPC cho tất cả resources (ALB, RDS, ECS).

### Task 2.2: Kiểm tra Docker và Git

```bash
docker --version
git --version
aws --version
```

Cả 3 lệnh phải trả về thông tin phiên bản. Cloud9 trên Amazon Linux 2 đã cài sẵn Docker và Git.

### Task 2.3: Tăng dung lượng đĩa (nếu cần)

1. Truy cập **EC2 Console** → **Instances**.
2. Chọn instance của Cloud9 (thường có tên `aws-cloud9-...`).
3. Chọn thẻ **Storage** → Bấm vào **Volume ID**.
4. Chọn Volume → **Actions** → **Modify volume**.
5. Thay đổi Size lên **20GB** → Bấm **Modify**.

Sau đó quay lại terminal Cloud9 chạy lệnh:

```bash
# Kiểm tra dung lượng hiện tại
df -h

# Mở rộng partition (cho NVMe disk trên Cloud9 mới)
sudo growpart /dev/nvme0n1 1

# Mở rộng file system (XFS trên Amazon Linux 2)
sudo xfs_growfs -d /

# Kiểm tra lại kết quả
df -h
```

---

## Phase 3: Tạo GitHub Repository và push code

### Task 3.1: Clone project code vào Cloud9

```bash
cd ~/environment
git clone https://github.com/2Nhan/SOA_PROJECT.git
cd SOA_PROJECT
```

> **Note**: Thư mục clone là `SOA_PROJECT`. Tất cả lệnh tiếp theo dùng `cd ~/environment/SOA_PROJECT`.

### Task 3.2: Kiểm tra cấu trúc project

```bash
cd ~/environment/SOA_PROJECT
ls -la
```

Bạn sẽ thấy:
```
├── .github/
│   └── workflows/
│       └── deploy.yml          ← GitHub Actions CI/CD workflow
├── GUIDE.md
├── GUIDE_GITHUB_ACTIONS.md     ← File hướng dẫn này
├── README.md
├── deploy.sh                   ← Script deploy thủ công (fallback)
├── docker-compose.yml
├── shared/                     ← Code dùng chung giữa 3 services
├── deployment/                 ← Task definitions, AppSpec, SQL scripts
└── microservices/
    ├── auth/
    ├── shop/
    └── supplier/
```

### Task 3.3: Tạo CodeCommit repository (optional — giữ cho tương thích)

```bash
# Nếu cần CodeCommit cho bài lab:
aws codecommit create-repository --repository-name b2b-marketplace

cd ~/environment/SOA_PROJECT
git remote add codecommit https://git-codecommit.us-east-1.amazonaws.com/v1/repos/b2b-marketplace
git push -u codecommit main
```

> **Note**: GitHub là source of truth chính. CodeCommit chỉ là mirror nếu bài lab yêu cầu.

---

## Phase 3.5: Tạo Amazon S3 Bucket

### Task 3.4: Tạo S3 bucket

1. Mở **Amazon S3** console
2. Bấm **Create bucket**
3. **Bucket name**: `b2b-marketplace-images` (phải globally unique — nếu bị trùng, thêm suffix như `-yourname`)
4. **Region**: US East (N. Virginia) (us-east-1)
5. **Object Ownership**: ACLs enabled, Bucket owner preferred
6. **Block Public Access**: **Bỏ check** "Block all public access"
7. Check box "I acknowledge..."
8. Bấm **Create bucket**

### Task 3.5: Tạo folder cho CodeDeploy

1. Mở bucket vừa tạo
2. Bấm **Create folder** → Tên: `deploy`
3. Bấm **Create folder**

> ⚠️ Nếu dùng tên bucket khác, phải update `S3_BUCKET` trong `taskdef-supplier.json`, `deploy.sh`, và `.github/workflows/deploy.yml`.
# 1. Cập nhật trong Task Definition của Supplier
sed -i 's/b2b-marketplace-images/{Tên bucket của bạn}/g' deployment/taskdef-supplier.json

# 2. Cập nhật trong script deploy thủ công
sed -i 's/b2b-marketplace-images/{Tên bucket của bạn}/g' deploy.sh

# 3. Cập nhật trong file workflow của GitHub Actions
sed -i 's/b2b-marketplace-images/{Tên bucket của bạn}/g' .github/workflows/deploy.yml


---

## Phase 4: Build và test Microservices trên Docker (Local)

> **Sử dụng Docker Compose** để khởi chạy toàn bộ hệ thống (MySQL + 3 microservices) chỉ với vài lệnh. Docker Compose tự động: tạo network, khởi tạo database, cấu hình biến môi trường, và quản lý thứ tự khởi động.

### Task 4.1: Mở cổng trên Security Group của Cloud9

1. Trong **EC2 Console**, vào tab Security chọn link ở Security Group của Cloud9 instance
2. Bấm **Edit Inbound Rules** → Thêm 3 rules:
   - Custom TCP, Port **8080**, Source: `0.0.0.0/0`(AnywhereV4)
   - Custom TCP, Port **8081**, Source: `0.0.0.0/0`(AnywhereV4)
   - Custom TCP, Port **8082**, Source: `0.0.0.0/0`(AnywhereV4)
3. Bấm **Save rules**

### Task 4.2: Cài đặt Docker Compose v2

Cloud9 (Amazon Linux 2) chưa cài sẵn Docker Compose. Cài bằng lệnh:

```bash
# Tạo thư mục plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins

# Tải Docker Compose v2 (Linux x86_64)
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose

# Phân quyền thực thi
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Xóa buildx plugin nếu bị lỗi exec format
sudo rm -f /usr/local/lib/docker/cli-plugins/docker-buildx

# Kiểm tra
docker compose version
```

Phải trả về `Docker Compose version v2.x.x`.

### Task 4.3: Build và chạy toàn bộ hệ thống

```bash
cd ~/environment/SOA_PROJECT

# Build Docker images cho 3 services
docker build -t soa_project-auth -f ./microservices/auth/docker/Dockerfile .
docker build -t soa_project-shop -f ./microservices/shop/docker/Dockerfile .
docker build -t soa_project-supplier -f ./microservices/supplier/docker/Dockerfile .

# Khởi chạy toàn bộ (MySQL + Auth + Shop + Supplier)
docker compose up
```

Đợi đến khi thấy cả 3 service hiển thị:
```
auth-1      | [Auth Service] Configured and running on port 8082
shop-1      | [Shop Service] Configured and running on port 8080
supplier-1  | [Supplier Service] Configured and running on port 8080
```

> ⚠️ Docker Compose sẽ tự động: tạo MySQL container, chạy init SQL scripts (seed data), tạo Docker network, và khởi động 3 services theo đúng thứ tự.

### Task 4.4: Kiểm tra hệ thống

Mở terminal mới (giữ docker compose chạy ở terminal cũ):

```bash
# Test Health Check
curl -s http://localhost:8082/health   # Auth  → {"status":"ok"}
curl -s http://localhost:8080/health   # Shop  → {"status":"ok"}
curl -s http://localhost:8081/health   # Supplier → {"status":"ok"}

Khi test xong, dọn dẹp:
```bash
# Ctrl+C để dừng docker compose, sau đó:
docker compose down -v
```

---

## Phase 5: Tạo ECR, ECS Cluster, Task Definitions

### Task 5.1: Tạo ECR repositories và push Docker images

```bash
cd ~/environment/SOA_PROJECT

# Build Docker images (clean build)
docker build --no-cache -t auth -f ./microservices/auth/docker/Dockerfile .
docker build --no-cache -t shop -f ./microservices/shop/docker/Dockerfile .
docker build --no-cache -t supplier -f ./microservices/supplier/docker/Dockerfile .

# Lấy Account ID
account_id=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $account_id"

# Login Docker vào ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS \
  --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com

# Tạo 3 ECR repositories
aws ecr create-repository --repository-name auth
aws ecr create-repository --repository-name shop
aws ecr create-repository --repository-name supplier
```

Xác nhận: Tìm **ECR** trong console → **Repositories** → Xác nhận có `auth`, `shop`, `supplier`.

```bash
# Tag và push images lên ECR
docker tag auth:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/auth:latest
docker tag shop:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker tag supplier:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest

docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/auth:latest
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest
```

Xác nhận: Vào mỗi repository → xác nhận tag `latest` xuất hiện.

### Task 5.2: Tạo ECS Cluster

1. Mở **Amazon ECS** console
2. Bấm **Create Cluster**
3. **Cluster name**: `b2b-marketplace`
4. **Infrastructure**: Chọn **AWS Fargate (serverless)** (bỏ check EC2 nếu đang check)
5. Bấm **Create**

> ⚠️ Nếu console lỗi IAM:
> ```bash
> aws ecs create-cluster --cluster-name b2b-marketplace
> ```

### Task 5.3: Chuẩn bị Task Definition Templates

Trong thư mục `deployment/`, bạn sẽ thấy các file `taskdef-*.json` chứa các giá trị placeholder như `<ACCOUNT-ID>`, `<IMAGE1_NAME>`, `<RDS-ENDPOINT>`. 

Chúng ta sẽ **không** đăng ký chúng thủ công ở bước này. Toàn bộ việc điền thông tin và đăng ký (register) sẽ được thực hiện tự động bằng script ở **Phase 8**, sau khi bạn đã có đầy đủ các tài nguyên khác (RDS, ALB, Security Groups).

### Task 5.4: Tạo CloudWatch Log Groups

```bash
aws logs create-log-group --log-group-name /ecs/auth --region us-east-1
aws logs create-log-group --log-group-name /ecs/shop --region us-east-1
aws logs create-log-group --log-group-name /ecs/supplier --region us-east-1
```

---

## Phase 6: Tạo Database (Amazon RDS)

### Task 6.1: Tạo RDS MySQL instance

1. Mở **Amazon RDS** console → **Create database**
2. Cấu hình:
   - **Engine**: MySQL 8.0
   - **Template**: Free tier (hoặc Dev/Test)
   - **DB instance identifier**: `b2bmarket-db`
   - **Master username**: `admin`
   - **Master password**: `lab-password`
   - **Instance class**: `db.c6gd.medium` (nhỏ nhất available trên Learner Lab)
   - **Storage**: 20 GB gp3, tắt auto-scaling
   - **Multi-AZ**: **NO** (tiết kiệm chi phí)
   - **VPC**: LabVPC (hoặc default VPC)
   - **Public access**: **Yes** (để Cloud9 kết nối setup)
   - **Security group**: Tạo mới → `b2b-rds-sg`
   - **Initial database name**: (để trống)
   - **Tắt Enhanced Monitoring** (không hỗ trợ trên Learner Lab)
   - **Tắt Performance Insights**
   - **Backup retention**: 1 ngày
3. Bấm **Create database** → Đợi 5-10 phút đến khi status = **Available**

### Task 6.2: Cấu hình RDS Security Group

1. **EC2** console → **Security Groups** → Tìm `b2b-rds-sg`
2. **Edit Inbound Rules**:
   - Type: **MySQL/Aurora (TCP 3306)**, Source: Cloud9 Security Group ID
   - Type: **MySQL/Aurora (TCP 3306)**, Source: **Custom** → `b2b-ecs-sg` (sẽ tạo ở Phase 7)

> ⚠️ Nếu chưa tạo `b2b-ecs-sg`, có thể dùng **Set up EC2 connection** trong RDS console: chọn DB instance → **Connected compute resources** → **Set up EC2 connection** → chọn Cloud9 EC2 instance.

### Task 6.3: Khởi tạo database

```bash
# Lấy RDS Endpoint từ console: RDS → Databases → b2bmarket-db → Copy Endpoint

# Kết nối test
mysql -h <RDS-ENDPOINT> -u admin -p
# Nhập password: rootpass
SHOW DATABASES;
exit

# Load schema và seed data
mysql -h <RDS-ENDPOINT> -u admin -plab-password < ~/environment/SOA_PROJECT/deployment/auth_db_init.sql
mysql -h <RDS-ENDPOINT> -u admin -plab-password < ~/environment/SOA_PROJECT/deployment/supplier_db_init.sql
mysql -h <RDS-ENDPOINT> -u admin -plab-password < ~/environment/SOA_PROJECT/deployment/shop_db_init.sql
```

Xác nhận:
```bash
mysql -h <RDS-ENDPOINT> -u admin -plab-password auth_db -e "SHOW TABLES;"
```

Phải thấy các bảng: `users`, `products`, `rfqs`, `quotes`, `contracts`, `orders`, `payments`.

### Task 6.4: Lưu lại RDS Endpoint

Sau khi tạo xong, bạn hãy copy **Endpoint** của RDS (ví dụ: `b2bmarket-db.cxxxxx.us-east-1.rds.amazonaws.com`). Chúng ta sẽ dùng script tự động để điền vào các file cấu hình ở Phase 8.

---

## Phase 7: Tạo Target Groups và Application Load Balancer

### Task 7.1: Tạo Security Groups

1. **EC2** console → **Security Groups** → **Create Security Group**

**Security Group 1 — ALB:**
- **Name**: `b2b-alb-sg`
- **VPC**: LabVPC (hoặc VPC đang dùng)
- **Inbound Rules**: HTTP (TCP 80), Source: `0.0.0.0/0`
- **Outbound Rules**: Default (all traffic)

**Security Group 2 — ECS Tasks:**
- **Name**: `b2b-ecs-sg`
- **VPC**: Cùng VPC
- **Inbound Rules**:
  - Custom TCP, Port **8080**, Source: `b2b-alb-sg` (ALB → Shop/Supplier)
  - Custom TCP, Port **8082**, Source: `b2b-alb-sg` (ALB → Auth)
  - Custom TCP, Port **8082**, Source: `b2b-ecs-sg` (Shop/Supplier → Auth internal)
- **Outbound Rules**: Default (all traffic — cần cho ECR, RDS, S3, CloudWatch)

2. Update `b2b-rds-sg`: Thêm Inbound Rule: MySQL/Aurora (TCP 3306), Source: `b2b-ecs-sg`

Kiến trúc mạng 3 lớp:
```
┌─────────────────────────────────────────────────────────┐
│  b2b-alb-sg (ALB Security Group)                        │
│  Inbound:  TCP 80 from 0.0.0.0/0 (Internet)             │
└──────────────────────┬──────────────────────────────────┘
                       │ TCP 8080, 8082
                       ▼
┌─────────────────────────────────────────────────────────┐
│  b2b-ecs-sg (ECS Tasks Security Group)                  │
│  Inbound:  TCP 8080 from b2b-alb-sg (Shop/Supplier)     │
│           TCP 8082 from b2b-alb-sg (Auth)                │
│           TCP 8082 from b2b-ecs-sg (internal)            │
└──────────────────────┬──────────────────────────────────┘
                       │ TCP 3306
                       ▼
┌─────────────────────────────────────────────────────────┐
│  b2b-rds-sg (RDS Security Group)                        │
│  Inbound:  TCP 3306 from b2b-ecs-sg only                │
└─────────────────────────────────────────────────────────┘
```

### Task 7.2: Tạo 6 Target Groups

Blue/Green deployment cần **2 target groups mỗi service** (6 tổng) để luân phiên traffic:

| Target Group Name | Type | Port | Health Check | Service |
|---|---|---|---|---|
| `auth-tg-one` | IP addresses | **8082** | `/health` | Auth |
| `auth-tg-two` | IP addresses | **8082** | `/health` | Auth |
| `shop-tg-one` | IP addresses | **8080** | `/health` | Shop |
| `shop-tg-two` | IP addresses | **8080** | `/health` | Shop |
| `supplier-tg-one` | IP addresses | **8080** | `/health` | Supplier |
| `supplier-tg-two` | IP addresses | **8080** | `/health` | Supplier |

**Các lưu ý quan trọng khi tạo:**
1. Target type: **IP addresses**.
2. Protocol: **HTTP**.
3. VPC: Cùng VPC đang dùng cho ECS/ALB.
4. Health check path: **/health**.
5. **Dòng thời gian**: Luôn để Target Group rỗng (ECS sẽ tự đăng ký Container vào khi service start).

### Task 7.3: Tạo Application Load Balancer

1. **EC2** console → **Load Balancers** → **Create Load Balancer** → **Application Load Balancer**
2. Cấu hình:
   - **Name**: `b2b-alb`
   - **Scheme**: **Internet-facing**
   - **Mappings**: Chọn VPC và **ít nhất 2 Public Subnets** (ở các AZ khác nhau).
   - **Security group**: `b2b-alb-sg`
   - **Listener HTTP:80**: Default action → Forward to `shop-tg-two`
3. Bấm **Create load balancer**

### Task 7.4: Cấu hình ALB Listener Rules (Path-Based Routing)

Vào listener **HTTP:80** của `b2b-alb`, chọn **Add rules** với thứ tự ưu tiên như sau:

| Priority | Condition (Path is) | Action (Forward to) |
|---|---|---|
| 1 | `/api/auth*`, `/login*`, `/register*` | `auth-tg-two` |
| 2 | `/api/supplier*`, `/admin*` | `supplier-tg-two` |
| 3 | `/api/shop*` | `shop-tg-two` |
| Default | (Mọi path khác) | `shop-tg-two` |

---

## Phase 8: Tạo ba ECS Services

### Task 8.1: Tự động hóa điền giá trị và Đăng ký Task Definitions

Sau khi đã hoàn tất Phase 1 đến Phase 7, bạn đã có đầy đủ: ECR Images, RDS Endpoint, ALB, Target Groups và Security Groups.

Bây giờ, hãy chạy kịch bản Bash duy nhất dưới đây. Script này sẽ tự động lấy mọi thông tin cần thiết từ AWS, điền vào các file JSON, đăng ký Task Definition mới và lấy chính xác số **Revision** để điền vào file tạo Service.

```bash
cd ~/environment/SOA_PROJECT/deployment

# 1. Cấu hình các biến (HÃY SỬA TÊN S3 BUCKET CỦA BẠN TẠI ĐÂY)
S3_BUCKET_NAME="b2b-marketplace-images" 

# 2. Lấy thông tin tài nguyên từ AWS
echo "Đang lấy các giá trị từ AWS..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

AUTH_TG=$(aws elbv2 describe-target-groups --names auth-tg-two --query 'TargetGroups[0].TargetGroupArn' --output text)
SHOP_TG=$(aws elbv2 describe-target-groups --names shop-tg-two --query 'TargetGroups[0].TargetGroupArn' --output text)
SUPPLIER_TG=$(aws elbv2 describe-target-groups --names supplier-tg-two --query 'TargetGroups[0].TargetGroupArn' --output text)

ECS_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=b2b-ecs-sg --query 'SecurityGroups[0].GroupId' --output text)

SUBNETS=$(aws elbv2 describe-load-balancers --names b2b-alb --query 'LoadBalancers[0].AvailabilityZones[*].SubnetId' --output text)
SUBNET_1=$(echo $SUBNETS | awk '{print $1}')
SUBNET_2=$(echo $SUBNETS | awk '{print $2}')

ALB_DNS=$(aws elbv2 describe-load-balancers --names b2b-alb --query 'LoadBalancers[0].DNSName' --output text)
RDS_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier b2bmarket-db --query 'DBInstances[0].Endpoint.Address' --output text)

# 2. Cập nhật dữ liệu cho các file taskdef-*.json
echo "Điền giá trị vào taskdef-*.json..."
sed -i "s|<ACCOUNT-ID>|$ACCOUNT_ID|g" taskdef-*.json
sed -i "s|<IMAGE1_NAME>|$ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/auth:latest|g" taskdef-auth.json
sed -i "s|<IMAGE1_NAME>|$ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/shop:latest|g" taskdef-shop.json
sed -i "s|<IMAGE1_NAME>|$ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/supplier:latest|g" taskdef-supplier.json
sed -i "s|<RDS-ENDPOINT>|$RDS_ENDPOINT|g" taskdef-*.json
sed -i "s|http://<ALB-DNS-NAME>|http://$ALB_DNS|g" taskdef-*.json

# Đặc biệt cho Supplier/Auth/Shop (điền S3 và Session Shared DB)
sed -i "s/\"name\": \"S3_BUCKET\", \"value\": \".*\"/\"name\": \"S3_BUCKET\", \"value\": \"$S3_BUCKET_NAME\"/g" taskdef-supplier.json

# Bảo đảm biến SESSION_DB_NAME luôn có mặt để tránh lỗi login
sed -i "/\"name\": \"SESSION_DB_NAME\"/!i {\"name\": \"SESSION_DB_NAME\", \"value\": \"auth_db\"}," taskdef-*.json

# 3. Đăng ký Task Definitions mới lên ECS và bắt lấy chính xác REVISION ARN
echo "Đang đăng ký Task Definitions để lấy Revision ARN..."
AUTH_REV_ARN=$(aws ecs register-task-definition --cli-input-json file://taskdef-auth.json --query 'taskDefinition.taskDefinitionArn' --output text)
SHOP_REV_ARN=$(aws ecs register-task-definition --cli-input-json file://taskdef-shop.json --query 'taskDefinition.taskDefinitionArn' --output text)
SUPPLIER_REV_ARN=$(aws ecs register-task-definition --cli-input-json file://taskdef-supplier.json --query 'taskDefinition.taskDefinitionArn' --output text)

# Lấy số Revision để điền vào file Create Service
AUTH_REV=$(echo $AUTH_REV_ARN | awk -F: '{print $NF}')
SHOP_REV=$(echo $SHOP_REV_ARN | awk -F: '{print $NF}')
SUPPLIER_REV=$(echo $SUPPLIER_REV_ARN | awk -F: '{print $NF}')

echo "-> Revision mới nhất: Auth=$AUTH_REV | Shop=$SHOP_REV | Supplier=$SUPPLIER_REV"

# 4. Cập nhật dữ liệu cho các file create-*.json
echo "Điền giá trị vào create-*.json..."
sed -i "s|<ARN-auth-tg-two>|$AUTH_TG|g" create-auth-microservice-tg-two.json
sed -i "s|<REVISION-NUMBER>|$AUTH_REV|g" create-auth-microservice-tg-two.json

sed -i "s|<ARN-shop-tg-two>|$SHOP_TG|g" create-shop-microservice-tg-two.json
sed -i "s|<REVISION-NUMBER>|$SHOP_REV|g" create-shop-microservice-tg-two.json

sed -i "s|<ARN-supplier-tg-two>|$SUPPLIER_TG|g" create-supplier-microservice-tg-two.json
sed -i "s|<REVISION-NUMBER>|$SUPPLIER_REV|g" create-supplier-microservice-tg-two.json

sed -i "s|<PUBLIC-SUBNET-1-ID>|$SUBNET_1|g" create-*.json
sed -i "s|<PUBLIC-SUBNET-2-ID>|$SUBNET_2|g" create-*.json
sed -i "s|<B2B-ECS-SG-ID>|$ECS_SG|g" create-*.json

# 5. Cập nhật các file AppSpec (Dùng cho CodeDeploy Blue/Green)
echo "Đang cập nhật các file appspec-*.yaml..."
sed -i "s|<TASK_DEFINITION>|$AUTH_REV_ARN|g" appspec-auth.yaml
sed -i "s|<TASK_DEFINITION>|$SHOP_REV_ARN|g" appspec-shop.yaml
sed -i "s|<TASK_DEFINITION>|$SUPPLIER_REV_ARN|g" appspec-supplier.yaml

echo "Hoàn tất kịch bản! Các file JSON và AppSpec đã sẵn sàng."
```


### Task 8.2: Tạo 3 ECS Services

```bash
cd ~/environment/SOA_PROJECT/deployment

# Tạo Shop service
aws ecs create-service --service-name shop-service \
  --cli-input-json file://create-shop-microservice-tg-two.json

# Tạo Supplier service
aws ecs create-service --service-name supplier-service \
  --cli-input-json file://create-supplier-microservice-tg-two.json

# Tạo Auth service
aws ecs create-service --service-name auth-service \
  --cli-input-json file://create-auth-microservice-tg-two.json
```

Xác nhận cho mỗi service:
1. **ECS Console** → **Clusters** → `b2b-marketplace` → **Services** → xác nhận Running count: 1
2. **Target Groups** → xác nhận mỗi `-tg-two` có 1 healthy target

### Task 8.3: Test qua ALB

1. Copy ALB DNS Name từ **EC2** → **Load Balancers** → `b2b-alb`
2. Mở `http://<ALB-DNS-Name>/` → Trang login Shop
3. Mở `http://<ALB-DNS-Name>/admin/login` → Trang login Supplier
4. Mở `http://<ALB-DNS-Name>/health` → `{"status":"ok"}`

---

## Phase 9: Cấu hình CodeDeploy (Blue/Green Deployment)

### Task 9.1: Tạo CodeDeploy Application

```bash
aws deploy create-application --application-name b2b-marketplace --compute-platform ECS
```

### Task 9.2: Tạo Deployment Groups cho 3 services

```bash
# Lấy các giá trị cần thiết
account_id=$(aws sts get-caller-identity --query Account --output text)
alb_arn=$(aws elbv2 describe-load-balancers --names b2b-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text)
listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn $alb_arn --query 'Listeners[0].ListenerArn' --output text)

# ── Shop Deployment Group ──
aws deploy create-deployment-group \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-shop-dg \
  --service-role-arn arn:aws:iam::${account_id}:role/LabRole \
  --deployment-config-name CodeDeployDefault.ECSAllAtOnce \
  --ecs-services clusterName=b2b-marketplace,serviceName=shop-service \
  --load-balancer-info "targetGroupPairInfoList=[{targetGroups=[{name=shop-tg-two},{name=shop-tg-one}],prodTrafficRoute={listenerArns=[$listener_arn]}}]" \
  --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL \
  --blue-green-deployment-configuration "terminateBlueInstancesOnDeploymentSuccess={action=TERMINATE,terminationWaitTimeInMinutes=5},deploymentReadyOption={actionOnTimeout=CONTINUE_DEPLOYMENT}"

# ── Supplier Deployment Group ──
aws deploy create-deployment-group \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-supplier-dg \
  --service-role-arn arn:aws:iam::${account_id}:role/LabRole \
  --deployment-config-name CodeDeployDefault.ECSAllAtOnce \
  --ecs-services clusterName=b2b-marketplace,serviceName=supplier-service \
  --load-balancer-info "targetGroupPairInfoList=[{targetGroups=[{name=supplier-tg-two},{name=supplier-tg-one}],prodTrafficRoute={listenerArns=[$listener_arn]}}]" \
  --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL \
  --blue-green-deployment-configuration "terminateBlueInstancesOnDeploymentSuccess={action=TERMINATE,terminationWaitTimeInMinutes=5},deploymentReadyOption={actionOnTimeout=CONTINUE_DEPLOYMENT}"

# ── Auth Deployment Group ──
aws deploy create-deployment-group \
  --application-name b2b-marketplace \
  --deployment-group-name b2b-auth-dg \
  --service-role-arn arn:aws:iam::${account_id}:role/LabRole \
  --deployment-config-name CodeDeployDefault.ECSAllAtOnce \
  --ecs-services clusterName=b2b-marketplace,serviceName=auth-service \
  --load-balancer-info "targetGroupPairInfoList=[{targetGroups=[{name=auth-tg-two},{name=auth-tg-one}],prodTrafficRoute={listenerArns=[$listener_arn]}}]" \
  --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL \
  --blue-green-deployment-configuration "terminateBlueInstancesOnDeploymentSuccess={action=TERMINATE,terminationWaitTimeInMinutes=5},deploymentReadyOption={actionOnTimeout=CONTINUE_DEPLOYMENT}"

echo "Cấu hình CodeDeploy hoàn tất!"
```

Xác nhận: **CodeDeploy** console → `b2b-marketplace` → xác nhận 3 deployment groups.

---

## Phase 10: Cấu hình GitHub Actions CI/CD

> **Đây là phần quan trọng nhất — thay thế CodePipeline/CodeBuild bằng GitHub Actions.**

### Task 10.1: Hiểu file workflow

File `.github/workflows/deploy.yml` đã có sẵn trong project. Workflow này:

1. **Trigger**: Tự động khi push code lên `main` branch, hoặc trigger thủ công
2. **Detect changes**: Phát hiện service nào thay đổi (chỉ build/deploy service đó)
3. **Smart detection**: Nếu `shared/` thay đổi → deploy cả 3 services
4. **Build**: Build Docker image trên GitHub Runner (ubuntu-latest)
5. **Push**: Push image lên ECR với 2 tags: `latest` + commit SHA
6. **Deploy**: Register task definition mới → Trigger CodeDeploy Blue/Green

### Task 10.2: Lấy AWS Credentials và S3 Bucket từ Lab

1. **Lấy AWS Credentials:** Trong AWS Academy → Bấm **AWS Details** → **Show** bên cạnh **AWS CLI** và copy 3 giá trị (`aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`).
2. **Lấy tên S3 Bucket:** Truy cập **S3 console** → Tìm bucket bạn đã tạo ở Phase 2 (thường có dạng `b2b-marketplace-images-<mssv>`). **Copy chính xác tên này.**

3. Truy cập GitHub Repo của bạn → **Settings** → **Secrets and variables** → **Actions**
4. Tạo và cập nhật **4 Repository secrets** sau:

| Secret Name | Nội dung (Value) |
|---|---|
| `AWS_ACCESS_KEY_ID` | Dán giá trị từ Lab |
| `AWS_SECRET_ACCESS_KEY` | Dán giá trị từ Lab |
| `AWS_SESSION_TOKEN` | Dán giá trị từ Lab |
| `S3_BUCKET` | **Dán chính xác tên S3 Bucket bạn vừa copy ở bước 2** |

> ⚠️ **QUAN TRỌNG**: 
> *   Credentials của Learner Lab sẽ **hết hạn** sau mỗi phiên làm việc. Bạn phải cập nhật 3 mã AWS Secrets mỗi khi bắt đầu buổi Lab mới.
> *   `S3_BUCKET` là tên duy nhất của bạn, nếu điền sai Pipeline sẽ không thể upload file cấu hình và sẽ báo lỗi.

### Task 10.3: Thêm AWS Secrets vào GitHub Repository

1. Mở GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Bấm **New repository secret** và thêm 3 secrets:

| Secret Name | Giá trị |
|---|---|
| `AWS_ACCESS_KEY_ID` | Paste `aws_access_key_id` từ bước 10.2 |
| `AWS_SECRET_ACCESS_KEY` | Paste `aws_secret_access_key` từ bước 10.2 |
| `AWS_SESSION_TOKEN` | Paste `aws_session_token` từ bước 10.2 |

**Cách thêm step-by-step:**

1. Vào `https://github.com/<your-username>/SOA_PROJECT/settings/secrets/actions`
2. Bấm **New repository secret**
3. **Name**: `AWS_ACCESS_KEY_ID` → **Secret**: paste giá trị → Bấm **Add secret**
4. Lặp lại cho `AWS_SECRET_ACCESS_KEY` và `AWS_SESSION_TOKEN`

Sau khi thêm xong, trang secrets sẽ hiển thị 3 secrets:
```
AWS_ACCESS_KEY_ID        Updated just now
AWS_SECRET_ACCESS_KEY    Updated just now
AWS_SESSION_TOKEN        Updated just now
```

### Task 10.4: Commit và push deployment files

```bash
cd ~/environment/SOA_PROJECT
git add .
git commit -m "Configure deployment files with actual AWS values"
git push origin main
```

> ⚠️ Push này sẽ trigger GitHub Actions workflow lần đầu tiên! Vào tab **Actions** trên GitHub để theo dõi.

---

## Phase 11: Test CI/CD Pipeline

### Task 11.1: Trigger CI/CD bằng code change

```bash
cd ~/environment/SOA_PROJECT/microservices/shop

# Sửa một thay đổi nhỏ (ví dụ: thêm comment vào index.js)
echo "// CI/CD test - $(date)" >> index.js

# Commit và push
cd ~/environment/SOA_PROJECT
git add .
git commit -m "Test CI/CD: GitHub Actions auto-deploy"
git push origin main
```

### Task 11.2: Theo dõi GitHub Actions Pipeline

1. Mở GitHub repo → Tab **Actions**
2. Bấm vào workflow run mới nhất: "Test CI/CD: GitHub Actions auto-deploy"
3. Quan sát các bước:
   - ✅ **Detect Changed Services**: Phát hiện `shop` thay đổi
   - ✅ **Deploy Shop Service**: Build → Push ECR → Register TaskDef → CodeDeploy
   - ⏭️ **Deploy Supplier Service**: Skipped (không thay đổi)
   - ⏭️ **Deploy Auth Service**: Skipped (không thay đổi)

### Task 11.3: Trigger thủ công (Manual Dispatch)

1. GitHub repo → Tab **Actions** → Chọn **Deploy to AWS ECS (Blue/Green)**
2. Bấm **Run workflow** → Chọn service:
   - `all`: Deploy cả 3 services
   - `shop`: Chỉ deploy shop
   - `supplier`: Chỉ deploy supplier
   - `auth`: Chỉ deploy auth
3. Bấm **Run workflow**

### Task 11.4: Theo dõi CodeDeploy

```bash
# Liệt kê deployments gần nhất
aws deploy list-deployments --application-name b2b-marketplace --output table

# Kiểm tra status của deployment cụ thể
aws deploy get-deployment --deployment-id <DEPLOYMENT-ID> \
  --query 'deploymentInfo.status' --output text
```

Hoặc xem trên **CodeDeploy Console** → **Deployments** → Watch blue/green traffic shift.

### Task 11.5: Xác nhận deployment

1. Mở ALB DNS URL trong browser
2. Xác nhận code change hiển thị
3. Kiểm tra **Target Groups** → quan sát traffic đã chuyển từ `tg-two` sang `tg-one`

### Task 11.6: Update GitHub Secrets khi Lab Session mới

> ⚠️ **MỖI KHI BẮT ĐẦU LAB SESSION MỚI**, bạn phải update 3 secrets:

1. Trong AWS Academy → bấm **Start Lab** → đợi lab ready
2. Bấm **AWS Details** → **Show** → Copy 3 credentials
3. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
4. Bấm **Update** cho từng secret → paste giá trị mới → **Update secret**

---

## Phase 12: CloudWatch Monitoring

### Task 12.1: Xem container logs

1. **CloudWatch** console → **Log groups**
2. Chọn `/ecs/shop` → Xem log stream mới nhất
3. Bạn sẽ thấy Express HTTP request logs:
   ```
   ::ffff:10.0.1.x - - [21/Apr/2026:06:00:00 +0000] "GET /health HTTP/1.1" 200 15 "-" "ELB-HealthChecker/2.0"
   ```
4. Kiểm tra tương tự cho `/ecs/supplier` và `/ecs/auth`

### Task 12.2: Tạo CloudWatch Dashboard (tùy chọn)

1. **CloudWatch** → **Dashboards** → **Create dashboard**
2. **Name**: `B2B-Marketplace`
3. Thêm widgets:
   - **ECS CPU Utilization**: Line graph → AWS/ECS → CPUUtilization
   - **ECS Memory Utilization**: Line graph → MemoryUtilization
   - **ALB Request Count**: Line graph → AWS/ApplicationELB → RequestCount
   - **RDS Connections**: Line graph → AWS/RDS → DatabaseConnections

---

## Quản lý ngân sách ($50 Learner Lab)

### Top Budget Killers

1. ❌ **NAT Gateway** (~$1.08/ngày) → Dùng PUBLIC subnets với `assignPublicIp: ENABLED`
2. ❌ **RDS chạy liên tục** (~$1.63/ngày) → PHẢI dừng khi không dùng
3. ❌ **Quên scale down ECS** (~$0.90/ngày) → Scale về 0 khi nghỉ

### Trước khi nghỉ / Cuối ngày:

```bash
# 1. Scale ECS về 0
aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 0
aws ecs update-service --cluster b2b-marketplace --service supplier-service --desired-count 0
aws ecs update-service --cluster b2b-marketplace --service auth-service --desired-count 0

# 2. Dừng RDS
aws rds stop-db-instance --db-instance-identifier b2bmarket-db
```

### Khi bắt đầu làm việc:

```bash
# 1. Start RDS (đợi 3-5 phút)
aws rds start-db-instance --db-instance-identifier b2bmarket-db

# 2. Scale ECS lên
aws ecs update-service --cluster b2b-marketplace --service shop-service --desired-count 1
aws ecs update-service --cluster b2b-marketplace --service supplier-service --desired-count 1
aws ecs update-service --cluster b2b-marketplace --service auth-service --desired-count 1
```

---

## Demo Script

### Step 0: Show AWS Infrastructure
1. **ECS Console** → Show 3 running services
2. **ALB Console** → Show listener rules (path-based routing)
3. **Target Groups** → Show 6 target groups (blue/green pairs)
4. **GitHub Actions** → Show recent CI/CD runs
5. **CloudWatch** → Show log streams
6. **CodeDeploy** → Show deployment history

### Step 1: Login & Registration
1. Shop: `http://<ALB-DNS>/login` → `shop1@b2bmarket.com` / `password123`
2. Supplier: `http://<ALB-DNS>/admin/login` → `admin@b2bmarket.com` / `password123`

### Step 2: Admin Approval
1. `/admin/manage` → Approve user → Approve product

### Step 3: RFQ → Quote → Contract Flow
1. **Shop**: Browse Products → Send RFQ
2. **Supplier**: RFQs → Submit Quote
3. **Shop**: My RFQs → Accept Quote → Contract auto-created

### Step 4: Order (Saga Pattern)
1. Shop: Create Order → Stock deducted
2. Supplier: Confirm → Payment
3. Demo Cancel → Stock restored (compensating transaction)

### Step 5: CI/CD Demo
1. Thay đổi code nhỏ trong Cloud9
2. Push lên GitHub
3. Show GitHub Actions đang chạy (Tab Actions)
4. Show CodeDeploy blue/green in progress
5. Refresh browser → Thấy phiên bản mới

---

## Daily Checklist

### Trước khi bắt đầu
- [ ] Start lab session
- [ ] **Update GitHub Secrets** nếu session mới (3 credentials)
- [ ] Start RDS: `aws rds start-db-instance --db-instance-identifier b2bmarket-db`
- [ ] Đợi 3-5 phút cho RDS available
- [ ] Scale ECS lên 1 cho cả 3 services
- [ ] Check budget

### Trước khi nghỉ
- [ ] Scale ECS về 0 cho cả 3 services
- [ ] Dừng RDS: `aws rds stop-db-instance --db-instance-identifier b2bmarket-db`
- [ ] Xác nhận: không có ECS task đang chạy, RDS status = "stopped"
- [ ] Kiểm tra không có NAT Gateway → XÓA nếu có
- [ ] Check budget đã dùng

### Sau Demo (Project hoàn thành)
```bash
# Xóa tất cả resources
aws ecs delete-service --cluster b2b-marketplace --service shop-service --force
aws ecs delete-service --cluster b2b-marketplace --service supplier-service --force
aws ecs delete-service --cluster b2b-marketplace --service auth-service --force
aws ecs delete-cluster --cluster b2b-marketplace
aws rds delete-db-instance --db-instance-identifier b2bmarket-db --skip-final-snapshot
aws ecr delete-repository --repository-name shop --force
aws ecr delete-repository --repository-name supplier --force
aws ecr delete-repository --repository-name auth --force
aws s3 rb s3://b2b-marketplace-images --force
aws logs delete-log-group --log-group-name /ecs/shop
aws logs delete-log-group --log-group-name /ecs/supplier
aws logs delete-log-group --log-group-name /ecs/auth
aws deploy delete-application --application-name b2b-marketplace
```

---

## Xử lý sự cố

### GitHub Actions fail: "Unable to locate credentials"
**Nguyên nhân**: AWS credentials hết hạn (Learner Lab session kết thúc).
**Fix**: Update 3 GitHub Secrets với credentials mới (xem Task 10.6).

### GitHub Actions fail: "The security token included in the request is expired"
**Nguyên nhân**: Giống trên — `AWS_SESSION_TOKEN` hết hạn.
**Fix**: Start lab session mới → update GitHub Secrets.

### CodeDeploy deployment failed
**Nguyên nhân**: ECS task không start được (thường do RDS chưa available).
**Fix**:
```bash
# Kiểm tra RDS status
aws rds describe-db-instances --db-instance-identifier b2bmarket-db \
  --query 'DBInstances[0].DBInstanceStatus' --output text

# Nếu "stopped" → start lại
aws rds start-db-instance --db-instance-identifier b2bmarket-db
```

### ECS task keeps restarting
**Nguyên nhân**: Lỗi kết nối database (sai endpoint, RDS stopped, security group sai).
**Fix**:
```bash
# Xem logs lỗi
aws logs get-log-events --log-group-name /ecs/shop \
  --log-stream-name $(aws logs describe-log-streams --log-group-name /ecs/shop \
  --order-by LastEventTime --descending --limit 1 \
  --query 'logStreams[0].logStreamName' --output text) \
  --limit 20
```

### Fallback: Deploy thủ công (nếu GitHub Actions không hoạt động)
```bash
cd ~/environment/SOA_PROJECT
chmod +x deploy.sh
./deploy.sh shop      # Deploy shop service
./deploy.sh supplier  # Deploy supplier service
./deploy.sh auth      # Deploy auth service
```
