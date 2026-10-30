# Pin to version tag for reproducible builds (avoid floating tag drift)
FROM node:20.19.4-alpine3.21

# Version injected at build (e.g. from CI tag or pr-N)
ARG VERSION=dev
ENV VERSION=$VERSION

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 80
CMD ["node", "server.js"]
