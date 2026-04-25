FROM node:18-alpine
WORKDIR /usr/src/app

# Copy supplier package files to root for shared module access
COPY microservices/supplier/package*.json ./
RUN npm install --production

# Copy shared logic and supplier microservice code
COPY shared ./shared
COPY microservices/supplier ./microservices/supplier

WORKDIR /usr/src/app/microservices/supplier
EXPOSE 8081
CMD ["node", "index.js"]
