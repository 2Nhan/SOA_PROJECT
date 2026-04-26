#!/bin/bash
# Usage: ./deploy.sh shop   OR   ./deploy.sh supplier   OR   ./deploy.sh auth

SERVICE=$1
if [ -z "$SERVICE" ]; then
  echo "Usage: ./deploy.sh <shop|supplier|auth>"
  exit 1
fi

account_id=$(aws sts get-caller-identity --query Account --output text)
IMAGE_URI="$account_id.dkr.ecr.us-east-1.amazonaws.com/$SERVICE:latest"

echo "=== Building $SERVICE ==="
cd ~/environment/SOA_PROJECT
# Build from project root to include the shared/ folder
docker build -t $SERVICE -f ./microservices/$SERVICE/docker/Dockerfile .

echo "=== Pushing to ECR ==="
docker tag $SERVICE:latest $IMAGE_URI
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $account_id.dkr.ecr.us-east-1.amazonaws.com
docker push $IMAGE_URI

echo "=== Registering new task definition ==="
cd ~/environment/SOA_PROJECT/deployment
# We register the existing task def directly (AWS fetches the latest image pushed to ECR under the 'latest' tag)
TASKDEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://taskdef-$SERVICE.json \
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
