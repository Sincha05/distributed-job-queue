# Cloudflare Containers only run linux/amd64 images.
FROM --platform=linux/amd64 node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# --ignore-scripts: nothing at runtime needs a native build (pg, ioredis, bullmq,
# typeorm and pino are pure JS), and it keeps postinstall out of the image.
RUN npm install --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY public ./public
RUN npm run build
# Drop devDependencies from node_modules before it is copied into the runtime stage.
RUN npm prune --production

FROM --platform=linux/amd64 node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# One image, two roles: ROLE=worker runs the BullMQ consumer, anything else the API.
CMD ["sh", "-c", "if [ \"$ROLE\" = worker ]; then exec node dist/worker-main.js; else exec node dist/main.js; fi"]
