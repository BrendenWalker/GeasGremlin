# Pin to version tag for reproducible builds (avoid floating tag drift)
FROM node:20.19.4-alpine3.21 AS build

# Version injected at build; Vite inlines VITE_* at build time
ARG VERSION=dev
ENV VITE_VERSION=$VERSION

# Prefer IPv4 for registry.npmjs.org — broken IPv6 in Docker Desktop often causes long hangs with no log output
ENV NODE_OPTIONS=--dns-result-order=ipv4first

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel=info 2>&1 | cat
COPY . .
RUN npm run build

# Production stage; pin to version tag for reproducible builds
FROM nginx:1.27.0-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
