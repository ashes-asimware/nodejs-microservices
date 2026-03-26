# Build context: workspace root (test-microservices/)
# docker build -f services/producer-service/Dockerfile -t producer-service .

# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace manifests and root tsconfig
COPY package.json package-lock.json tsconfig.json ./

# Copy source needed for producer
COPY shared/ ./shared/
COPY services/producer-service/ ./services/producer-service/

# Install all deps (hoisted workspace install)
RUN npm install

# Compile TypeScript from workspace root (output → dist/)
RUN npx tsc

# ---- Stage 2: Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

# Copy compiled output (entire dist tree preserved so relative imports resolve)
COPY --from=builder /app/dist ./dist

# Copy hoisted node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

CMD ["node", "dist/services/producer-service/src/index.js"]
