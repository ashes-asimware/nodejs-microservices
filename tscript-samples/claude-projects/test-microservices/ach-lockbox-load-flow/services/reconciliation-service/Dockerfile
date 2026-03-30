# Build stage
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY shared ./shared
COPY services/reconciliation-service ./services/reconciliation-service

RUN yarn workspace @ach-lockbox/reconciliation-service build

# Runtime stage
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3026

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy production dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy built application
COPY --from=builder /build/services/reconciliation-service/dist ./services/reconciliation-service/dist
COPY --from=builder /build/shared ./shared

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/reconciliation-service/dist/index.js"]
