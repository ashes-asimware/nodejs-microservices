# Build context: workspace root (test-microservices/)
# docker build -f services/consumer-service/Dockerfile -t consumer-service .

# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace manifests and root tsconfig
COPY package.json package-lock.json tsconfig.json ./

# Copy source needed for consumer
COPY shared/ ./shared/
COPY services/consumer-service/ ./services/consumer-service/

# Install all deps (hoisted workspace install, includes prisma CLI)
RUN npm install

# Generate Prisma client
RUN npx prisma generate --schema=services/consumer-service/prisma/schema.prisma

# Compile TypeScript from workspace root (output → dist/)
RUN npx tsc

# ---- Stage 2: Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy hoisted node_modules (includes generated @prisma/client and .prisma/client)
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma schema (needed for runtime migrations if any)
COPY --from=builder /app/services/consumer-service/prisma ./prisma

CMD ["node", "dist/services/consumer-service/src/index.js"]
