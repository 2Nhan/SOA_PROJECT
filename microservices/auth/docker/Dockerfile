FROM node:18-alpine
WORKDIR /usr/src/app

# Copy auth package files
COPY microservices/auth/package*.json ./microservices/auth/
WORKDIR /usr/src/app/microservices/auth
RUN npm install --production

# Go back to root app dir
WORKDIR /usr/src/app

# Copy shared logic
COPY shared ./shared

# Copy auth microservice code
COPY microservices/auth ./microservices/auth

WORKDIR /usr/src/app/microservices/auth
EXPOSE 8082
CMD ["node", "index.js"]
