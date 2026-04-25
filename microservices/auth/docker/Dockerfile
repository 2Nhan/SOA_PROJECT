FROM node:18-alpine
WORKDIR /usr/src/app

# Copy auth package files to root for shared module access
COPY microservices/auth/package*.json ./
RUN npm install --production

# Copy shared logic and auth microservice code
COPY shared ./shared
COPY microservices/auth ./microservices/auth

WORKDIR /usr/src/app/microservices/auth
EXPOSE 8082
CMD ["node", "index.js"]
