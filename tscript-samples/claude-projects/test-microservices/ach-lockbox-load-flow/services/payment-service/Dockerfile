# Build stage
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY shared ./shared
COPY services/payment-service ./services/payment-service

RUN yarn workspace @ach-lockbox/payment-service build

# Runtime stage
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3023

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy production dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy built application
COPY --from=builder /build/services/payment-service/dist ./services/payment-service/dist
COPY --from=builder /build/shared ./shared

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/payment-service/dist/index.js"]
