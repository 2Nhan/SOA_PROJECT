FROM node:18-alpine
WORKDIR /usr/src/app

# Copy supplier package files
COPY microservices/supplier/package*.json ./microservices/supplier/
WORKDIR /usr/src/app/microservices/supplier
RUN npm install --production

# Go back to root app dir
WORKDIR /usr/src/app

# Copy shared logic
COPY shared ./shared

# Copy supplier microservice code
COPY microservices/supplier ./microservices/supplier

WORKDIR /usr/src/app/microservices/supplier
EXPOSE 8081
CMD ["node", "index.js"]
