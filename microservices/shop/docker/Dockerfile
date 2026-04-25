FROM node:18-alpine
WORKDIR /usr/src/app

# Copy shop package files to root for shared module access
COPY microservices/shop/package*.json ./
RUN npm install --production

# Copy shared logic and shop microservice code
COPY shared ./shared
COPY microservices/shop ./microservices/shop

WORKDIR /usr/src/app/microservices/shop
EXPOSE 8080
CMD ["node", "index.js"]
