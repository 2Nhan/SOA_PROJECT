FROM node:18-alpine
WORKDIR /usr/src/app

# Copy shop package files
COPY microservices/shop/package*.json ./microservices/shop/
WORKDIR /usr/src/app/microservices/shop
RUN npm install --production

# Go back to root app dir
WORKDIR /usr/src/app

# Copy shared logic
COPY shared ./shared

# Copy shop microservice code
COPY microservices/shop ./microservices/shop

WORKDIR /usr/src/app/microservices/shop
EXPOSE 8080
CMD ["node", "index.js"]
