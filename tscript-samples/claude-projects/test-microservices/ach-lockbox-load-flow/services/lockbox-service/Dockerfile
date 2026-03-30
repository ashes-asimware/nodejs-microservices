# Build stage
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY shared ./shared
COPY services/lockbox-service ./services/lockbox-service

RUN yarn workspace @ach-lockbox/lockbox-service build

# Runtime stage
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3025

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy production dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy built application
COPY --from=builder /build/services/lockbox-service/dist ./services/lockbox-service/dist
COPY --from=builder /build/shared ./shared

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/lockbox-service/dist/index.js"]
