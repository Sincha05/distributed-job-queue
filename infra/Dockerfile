# Base stage
FROM node:20-alpine AS base
WORKDIR /app

# Dependencies stage
FROM base AS dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Build stage
FROM base AS build
COPY package.json package-lock.json* ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# API production stage
FROM base AS api
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Worker production stage
FROM base AS worker
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/worker-main.js"]
