FROM node:18-alpine

ARG VERSION=dev
ENV VERSION=$VERSION

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 80
CMD ["node", "server.js"]
