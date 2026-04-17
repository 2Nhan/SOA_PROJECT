# Hướng dẫn Step-by-Step: B2B Marketplace Microservices trên AWS Learner Lab

> **Dự án**: B2B Marketplace - Shop Service + Supplier Service  
> **Môi trường**: AWS Academy Learner Lab  
> **Region**: US East (N. Virginia) - us-east-1

---

## Phase 1: Planning - Thiết kế kiến trúc và ước tính chi phí

### Task 1.1: Tạo Architecture Diagram

Sử dụng [Draw.io](https://app.diagrams.net/) để vẽ sơ đồ kiến trúc gồm:

- **Client/Browser** → **Application Load Balancer (ALB)**
  - Path `/` → **Shop Service** (ECS Fargate Task)
  - Path `/admin/*` → **Supplier Service** (ECS Fargate Task)
- Cả 2 service kết nối → **Amazon RDS MySQL** (Private)
- **CI/CD**: CodeCommit → CodePipeline → CodeDeploy → ECS
- **ECR**: Lưu Docker images cho shop và supplier
- **CloudWatch**: Monitoring logs
- **Cloud9**: Development IDE

### Task 1.2: Ước tính chi phí

1. Truy cập [AWS Pricing Calculator](https://calculator.aws/)
2. Chọn Region: **US East (N. Virginia)**
3. Thêm các service (giả định 12 tháng):

| Service | Cấu hình | Chi phí/tháng |
|---------|----------|--------------|
| RDS MySQL | db.t3.micro, 20GB gp2, Single-AZ | ~$12.41 |
| ECS Fargate | 4 Tasks × 0.25 vCPU × 0.5GB | ~$29.20 |
| ALB | 1 ALB, ~1 LCU | ~$22.27 |
| ECR | 2 repos, ~500MB | ~$0.05 |
| CodePipeline | 2 pipelines | ~$2.00 |
| Cloud9 | t3.small (dev only) | ~$15.18 |
| **Tổng** | | **~$81.61/tháng** |

---

## Phase 2: Tạo RDS Database

### Task 2.1: Tạo RDS MySQL Instance

1. Mở **AWS Console** → Search **RDS** → **Create database**
2. Cấu hình:
   - **Engine**: MySQL
   - **Template**: Free tier
   - **DB instance identifier**: `b2bmarketdb`
   - **Master username**: `admin`
   - **Master password**: `lab-password`
   - **DB instance class**: `db.t3.micro` (Burstable)
   - **Storage**: 20 GB, gp2
   - **VPC**: `LabVPC`
   - **Public access**: No
   - **Additional configuration**:
     - Initial database name: `b2bmarket`
     - **Uncheck** Enhanced monitoring
3. Click **Create database**
4. Đợi status chuyển sang **Available** (~5-10 phút)
5. **Copy Endpoint** (ví dụ: `b2bmarketdb.xxxx.us-east-1.rds.amazonaws.com`)

---

## Phase 3: Tạo môi trường phát triển và push code lên CodeCommit

### Task 3.1: Tạo AWS Cloud9 IDE

1. Search **Cloud9** → **Create environment**
2. Cấu hình:
   - Name: `MicroservicesIDE`
   - Environment type: **New EC2 instance**
   - Instance type: **t3.small**
   - Platform: **Amazon Linux 2**
   - Network settings: Chọn **Secure Shell (SSH)**
   - VPC: **LabVPC** → **Public Subnet 1**
3. Click **Create** → **Open**

### Task 3.2: Upload source code lên Cloud9

Trong Cloud9 terminal, tạo cấu trúc thư mục:

```bash
mkdir -p ~/environment/microservices/shop
mkdir -p ~/environment/microservices/supplier
```

**Upload từng file** từ thư mục `microservices/shop/` và `microservices/supplier/` trong project đã tạo lên Cloud9.

Hoặc nếu có Git repo, clone trực tiếp:
```bash
cd ~/environment
git clone <your-repo-url> temp-repo
cp -r temp-repo/microservices/* ~/environment/microservices/
rm -rf temp-repo
```

### Task 3.3: Cấu hình database connection

Thay `<RDS-ENDPOINT>` trong cả 2 file config:

```bash
# Lấy RDS Endpoint
# Search RDS → Databases → b2bmarketdb → Copy Endpoint

# Sửa file config cho shop service
cd ~/environment/microservices/shop
sed -i "s/localhost/<RDS-ENDPOINT>/g" app/config/config.js

# Sửa file config cho supplier service
cd ~/environment/microservices/supplier
sed -i "s/localhost/<RDS-ENDPOINT>/g" app/config/config.js
```

### Task 3.4: Khởi tạo database

```bash
# Cài MySQL client
sudo yum install -y mysql

# Kết nối RDS và chạy script
mysql -h <RDS-ENDPOINT> -u admin -p
# Nhập password: lab-password
```

Sau khi kết nối MySQL, chạy nội dung file `deployment/db-init.sql`:

```sql
CREATE DATABASE IF NOT EXISTS b2bmarket;
USE b2bmarket;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role ENUM('shop', 'supplier', 'admin') DEFAULT 'shop',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  method ENUM('bank_transfer', 'qr_code', 'cod') DEFAULT 'bank_transfer',
  status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Seed data
INSERT INTO users (email, password_hash, full_name, role) VALUES
('shop1@b2bmarket.com', 'hashed_password', 'ABC Retail Shop', 'shop'),
('supplier1@b2bmarket.com', 'hashed_password', 'XYZ Supplies Co.', 'supplier'),
('admin@b2bmarket.com', 'hashed_password', 'System Admin', 'admin');

INSERT INTO products (supplier_id, name, description, price, stock, status, category) VALUES
(2, 'Premium Arabica Coffee Beans', 'High-quality Arabica beans from Vietnam highlands', 24.99, 100, 'active', 'Coffee'),
(2, 'Robusta Coffee Beans 1kg', 'Strong Robusta beans, dark roast', 18.50, 200, 'active', 'Coffee'),
(2, 'Green Tea Matcha Powder', 'Organic matcha powder', 32.00, 50, 'active', 'Tea'),
(2, 'Ceramic Coffee Mug Set (4pcs)', 'Handcrafted ceramic mugs', 45.00, 30, 'active', 'Accessories'),
(2, 'Stainless Steel Coffee Filter', 'Vietnamese phin coffee filter', 12.99, 150, 'active', 'Accessories'),
(2, 'Organic Honey 500ml', 'Pure organic wildflower honey', 15.75, 80, 'active', 'Condiments');

exit
```

### Task 3.5: Tạo CodeCommit repositories và push code

```bash
# Tạo repo microservices trên CodeCommit
# AWS Console → Search CodeCommit → Create repository
# Name: microservices → Create

# Push code
cd ~/environment/microservices
git init
git branch -m dev
git add .
git commit -m 'Initial B2B Marketplace microservices code'
git remote add origin https://git-codecommit.us-east-1.amazonaws.com/v1/repos/microservices
git push -u origin dev

# Cấu hình git user
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

---

## Phase 4: Build và test Docker containers

### Task 4.1: Mở Security Group cho Cloud9

1. **EC2 Console** → **Security Groups** → Tìm SG của Cloud9 instance
2. **Edit Inbound Rules** → Thêm:
   - Custom TCP, Port **8080**, Source: `0.0.0.0/0`
   - Custom TCP, Port **8081**, Source: `0.0.0.0/0`

### Task 4.2: Build và test Shop Service

```bash
cd ~/environment/microservices/shop

# Install dependencies
npm install

# Build Docker image
docker build --tag shop .

# Lấy DB endpoint
dbEndpoint=$(cat app/config/config.js | grep 'HOST' | cut -d '"' -f2)
echo $dbEndpoint

# Chạy container
docker run -d --name shop_1 -p 8080:8080 -e APP_DB_HOST="$dbEndpoint" shop

# Test
# Mở browser: http://<Cloud9-Public-IP>:8080
# Kiểm tra: Trang chủ hiện, xem products, tạo order
```

### Task 4.3: Build và test Supplier Service

```bash
cd ~/environment/microservices/supplier

# Install dependencies
npm install

# Build Docker image
docker build --tag supplier .

# Chạy container (tạm dùng port 8081)
docker run -d --name supplier_1 -p 8081:8081 -e APP_DB_HOST="$dbEndpoint" -e PORT=8081 supplier

# Test
# Mở browser: http://<Cloud9-Public-IP>:8081/admin/
# Kiểm tra: Dashboard, CRUD products, manage orders, process payment
```

### Task 4.4: Test Saga workflow end-to-end

1. Trên **Shop Service** (port 8080): Xem products → Tạo order → Kiểm tra stock giảm
2. Trên **Supplier Service** (port 8081): Xem orders → Confirm order → Process payment
3. **Test failure**: Cancel order → Kiểm tra stock được hoàn lại

### Task 4.5: Chỉnh port supplier về 8080 và rebuild

```bash
# Stop và xóa containers cũ
docker rm -f shop_1 supplier_1

# Supplier đã dùng port 8080 mặc định trong code, không cần sửa
cd ~/environment/microservices/supplier
docker build --tag supplier .
```

### Task 4.6: Commit và push code

```bash
cd ~/environment/microservices
git add .
git commit -m 'Tested microservices with Docker, Saga workflow verified'
git push origin dev
```

---

## Phase 5: Tạo ECR repositories, ECS cluster, Task definitions và AppSpec

### Task 5.1: Tạo ECR repositories và push Docker images

```bash
# Lấy Account ID
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)
echo $account_id

# Login Docker vào ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com

# Tạo 2 ECR repos
aws ecr create-repository --repository-name shop
aws ecr create-repository --repository-name supplier
```

**Set ECR Policy** cho mỗi repo:
1. Search **ECR** → **Repositories**
2. Chọn repo `shop` → **Permissions** → **Edit policy JSON** → Paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPull",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability"
      ]
    }
  ]
}
```

3. Lặp lại cho repo `supplier`

**Tag và push images:**

```bash
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)

# Tag
docker tag shop:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker tag supplier:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest

# Push
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest
docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest
```

Verify: ECR Console → mỗi repo phải có image `latest`

### Task 5.2: Tạo ECS Cluster

1. Search **ECS** → **Create Cluster**
2. Name: `microservices-serverlesscluster`
3. Giữ mặc định → **Create**

### Task 5.3: Tạo CodeCommit repo cho deployment files

```bash
# AWS Console → CodeCommit → Create repository: deployment

mkdir -p ~/environment/deployment
cd ~/environment/deployment
git init
git branch -m dev
git remote add origin https://git-codecommit.us-east-1.amazonaws.com/v1/repos/deployment
```

### Task 5.4: Tạo Task Definitions và register

**Upload file `taskdef-shop.json` và `taskdef-supplier.json`** từ thư mục `deployment/` lên `~/environment/deployment/`

**Sửa placeholders:**

```bash
cd ~/environment/deployment

# Lấy Account ID
account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)

# Lấy RDS Endpoint
# Từ RDS Console, copy endpoint

# Sửa taskdef-shop.json
# Thay <ACCOUNT-ID> bằng account_id
# Thay <RDS-ENDPOINT> bằng RDS endpoint thực
# Thay <IMAGE1_NAME> bằng image URI thực: $account_id.dkr.ecr.us-east-1.amazonaws.com/shop:latest

sed -i "s/<ACCOUNT-ID>/$account_id/g" taskdef-shop.json
sed -i "s/<RDS-ENDPOINT>/<your-rds-endpoint>/g" taskdef-shop.json
sed -i "s/<IMAGE1_NAME>/$account_id.dkr.ecr.us-east-1.amazonaws.com\/shop:latest/g" taskdef-shop.json

# Tương tự cho taskdef-supplier.json
sed -i "s/<ACCOUNT-ID>/$account_id/g" taskdef-supplier.json
sed -i "s/<RDS-ENDPOINT>/<your-rds-endpoint>/g" taskdef-supplier.json
sed -i "s/<IMAGE1_NAME>/$account_id.dkr.ecr.us-east-1.amazonaws.com\/supplier:latest/g" taskdef-supplier.json
```

**Tạo CloudWatch Log Groups:**

```bash
aws logs create-log-group --log-group-name /ecs/shop
aws logs create-log-group --log-group-name /ecs/supplier
```

**Register task definitions:**

```bash
aws ecs register-task-definition --cli-input-json file:///home/ec2-user/environment/deployment/taskdef-shop.json

aws ecs register-task-definition --cli-input-json file:///home/ec2-user/environment/deployment/taskdef-supplier.json
```

### Task 5.5: Tạo AppSpec files

Upload `appspec-shop.yaml` và `appspec-supplier.yaml` vào `~/environment/deployment/`

### Task 5.6: Đổi image thành placeholder và push

```bash
cd ~/environment/deployment

# Đổi image field về placeholder cho CI/CD
# Sửa taskdef-shop.json: "image" → "<IMAGE1_NAME>"
# Sửa taskdef-supplier.json: "image" → "<IMAGE1_NAME>"

# Commit và push
git add .
git commit -m 'Initial taskdef and appspec files with IMAGE1_NAME placeholder'
git push -u origin dev
```

---

## Phase 6: Tạo Target Groups và Application Load Balancer

### Task 6.1: Tạo 4 Target Groups

Vào **EC2 Console** → **Target Groups** → **Create target group**

Tạo lần lượt 4 TG (tất cả: Type **IP addresses**, Port **8080**, VPC **LabVPC**, Protocol **HTTP**):

| Name | Health Check Path |
|------|-------------------|
| `shop-tg-one` | `/` |
| `shop-tg-two` | `/` |
| `supplier-tg-one` | `/admin/` |
| `supplier-tg-two` | `/admin/` |

### Task 6.2: Tạo Security Group cho ALB

1. **EC2 Console** → **Security Groups** → **Create**
2. Name: `microservices-sg`, VPC: `LabVPC`
3. Inbound Rules:
   - TCP **80** from `0.0.0.0/0`
   - TCP **8080** from `0.0.0.0/0`

### Task 6.3: Tạo Application Load Balancer

1. **EC2** → **Load Balancers** → **Create** → **Application Load Balancer**
2. Name: `microservicesLB`
3. Scheme: **Internet-facing**
4. VPC: **LabVPC** → Chọn **Public Subnet 1** và **Public Subnet 2**
5. Security Group: `microservices-sg`
6. Listeners:
   - **HTTP:80** → Default action: Forward to `shop-tg-two`
   - **HTTP:8080** → Default action: Forward to `shop-tg-one`

### Task 6.4: Thêm routing rules cho /admin/*

**Listener HTTP:80:**
1. Chọn Listener → **Add rule**
2. Condition: **Path** → `/admin/*`
3. Action: Forward to `supplier-tg-two`
4. Priority: 1

**Listener HTTP:8080:**
1. Chọn Listener → **Add rule**
2. Condition: **Path** → `/admin/*`
3. Action: Forward to `supplier-tg-one`
4. Priority: 1

---

## Phase 7: Tạo 2 ECS Services

### Task 7.1: Tạo Shop ECS Service

Upload `create-shop-microservice-tg-two.json` và sửa placeholders:

```bash
cd ~/environment/deployment

# Lấy thông tin cần thiết:
# 1. REVISION-NUMBER: ECS Console → Task Definitions → shop → revision number
# 2. ARN shop-tg-two: EC2 → Target Groups → shop-tg-two → copy ARN
# 3. Subnet IDs: VPC → Subnets → Public Subnet 1 & 2 IDs
# 4. Security Group ID: EC2 → Security Groups → microservices-sg ID

# Sửa file create-shop-microservice-tg-two.json với giá trị thực

# Tạo service
aws ecs create-service --service-name shop-microservice --cli-input-json file://create-shop-microservice-tg-two.json
```

### Task 7.2: Tạo Supplier ECS Service

```bash
# Sửa file create-supplier-microservice-tg-two.json với giá trị thực
# (tương tự shop, thay supplier-tg-two ARN)

aws ecs create-service --service-name supplier-microservice --cli-input-json file://create-supplier-microservice-tg-two.json
```

### Task 7.3: Verify

1. **ECS Console** → Cluster → Services → Đợi cả 2 service status **ACTIVE**
2. **EC2** → Target Groups → Kiểm tra targets **healthy**
3. Truy cập `http://<ALB-DNS-Name>/` → Shop Service
4. Truy cập `http://<ALB-DNS-Name>/admin/` → Supplier Service

---

## Phase 8: Cấu hình CodeDeploy và CodePipeline

### Task 8.1: Tạo CodeDeploy Application

1. Search **CodeDeploy** → **Create application**
2. Name: `microservices`
3. Compute platform: **Amazon ECS**

### Task 8.2: Tạo Deployment Groups

**DG cho Shop:**
1. **Create deployment group**: `microservices-shop`
2. Service role: Chọn ARN `DeployRole`
3. ECS cluster: `microservices-serverlesscluster`
4. ECS service: `shop-microservice`
5. Load balancer: `microservicesLB`
6. Production listener: **HTTP:80**
7. Test listener: **HTTP:8080**
8. Target group 1: `shop-tg-two`
9. Target group 2: `shop-tg-one`
10. Traffic rerouting: **Reroute immediately**
11. Deployment config: `CodeDeployDefault.ECSAllAtOnce`
12. Original revision termination: 0 Days, 0 Hours, **5 Minutes**
13. Click **Create deployment group**

**DG cho Supplier** (tương tự):
1. Name: `microservices-supplier`
2. ECS service: `supplier-microservice`
3. Target group 1: `supplier-tg-two`
4. Target group 2: `supplier-tg-one`

### Task 8.3: Tạo Pipeline cho Shop Service

1. Search **CodePipeline** → **Create pipeline**
2. Name: `update-shop-microservice`
3. Chọn **Build custom pipeline**
4. Service role: **Existing service role** → chọn Pipeline Role ARN
5. **Source stage**:
   - Source provider: **Amazon ECR**
   - Repository name: `shop`
   - Image tag: `latest`
6. **Skip build stage**
7. **Skip test stage**
8. **Deploy stage**:
   - Deploy provider: **Amazon ECS (Blue/Green)**
   - Application name: `microservices`
   - Deployment group: `microservices-shop`
   - Task definition: **SourceArtifact** → `taskdef-shop.json`
   - AppSpec file: **SourceArtifact** → `appspec-shop.yaml`
   
   > **Lưu ý**: Source artifact ở đây là từ CodeCommit deployment repo. Cần thêm source stage thứ 2 cho deployment repo.

9. Click **Create Pipeline**

### Task 8.4: Tạo Pipeline cho Supplier Service

Tương tự Task 8.3:
- Name: `update-supplier-microservice`
- ECR repo: `supplier`
- Deployment group: `microservices-supplier`
- Task definition: `taskdef-supplier.json`
- AppSpec: `appspec-supplier.yaml`

---

## Phase 9: Test CI/CD, IP restriction, và Scale

### Task 9.1: Giới hạn IP truy cập Supplier Service

1. Tìm Public IP của bạn: https://www.whatismyip.com
2. **EC2** → **Load Balancers** → `microservicesLB` → **Listeners**
3. Sửa rule cho **HTTP:80** (path `/admin/*`):
   - Thêm condition: **Source IP** → `<Your-IP>/32`
4. Lặp lại cho **HTTP:8080**

### Task 9.2: Thay đổi UI và push image mới (Demo redeployment)

```bash
cd ~/environment/microservices/supplier/views/partials

# Thay đổi navbar từ dark → light
sed -i 's/navbar-dark bg-dark/navbar-light bg-light/g' nav.ejs
```

**Rebuild và push image:**

```bash
cd ~/environment/microservices/supplier
docker build --tag supplier .

account_id=$(aws sts get-caller-identity | grep Account | cut -d '"' -f4)

docker tag supplier:latest $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com

docker push $account_id.dkr.ecr.us-east-1.amazonaws.com/supplier:latest
```

### Task 9.3: Verify pipeline tự chạy

1. **CodePipeline Console** → `update-supplier-microservice` → Kiểm tra pipeline tự trigger
2. **CodeDeploy** → Monitor deployment cho đến khi thành công
3. Truy cập `http://<ALB-DNS>/admin/` → Confirm navbar đổi sang light color

### Task 9.4: Test IP restriction

1. Từ máy bạn (whitelisted IP): Truy cập `/admin/` → **OK**
2. Từ thiết bị/mạng khác: Truy cập `/admin/` → **404 hoặc bị chặn**

### Task 9.5: Scale Shop Service

```bash
aws ecs update-service --cluster microservices-serverlesscluster --service shop-microservice --desired-count 3
```

Verify: **ECS Console** → Services → `shop-microservice` → Running tasks = **3**

---

## Phase 10: Monitoring với CloudWatch

### Task 10.1: Xem logs

1. Search **CloudWatch** → **Log groups**
2. Mở `/ecs/shop` và `/ecs/supplier`
3. Kiểm tra log streams cho mỗi task
4. Screenshot làm evidence cho report

### Task 10.2: Kiểm tra metrics

1. **CloudWatch** → **Metrics** → **ECS**
2. Xem CPU/Memory utilization cho cluster
3. Screenshot

---

## Tổng kết: Checklist trước khi nộp

- [ ] Architecture diagram hoàn chỉnh
- [ ] Cost estimate từ AWS Pricing Calculator
- [ ] 2 microservices chạy trên ECS Fargate
- [ ] Shop Service: xem products, tạo orders
- [ ] Supplier Service: CRUD products, confirm/cancel orders, payment
- [ ] Saga Pattern: tạo order → giảm stock, cancel → hoàn stock
- [ ] ALB routing: `/` → Shop, `/admin/*` → Supplier
- [ ] CI/CD pipeline hoạt động (ít nhất 1 pipeline)
- [ ] Demo redeployment (thay đổi UI qua pipeline)
- [ ] CloudWatch logs evidence
- [ ] IP restriction cho admin path
- [ ] Scale shop service lên 3 tasks
- [ ] Screenshots cho report (Appendix)
- [ ] Technical report 20-30 trang
- [ ] Presentation slides

---

## Lưu ý quan trọng cho Learner Lab

1. **PHẢI stop RDS** khi không dùng để tiết kiệm budget
2. **Session timeout**: ECS tasks sẽ bị stop khi session hết. Start lại session để tiếp tục
3. **Không tạo IAM roles mới** - dùng `LabRole` cho tất cả
4. **Max 9 EC2 instances** đồng thời
5. **Region chỉ dùng**: `us-east-1` hoặc `us-west-2`
6. Khi tạo ECS task definition: chọn `LabRole` cho cả task role và execution role
