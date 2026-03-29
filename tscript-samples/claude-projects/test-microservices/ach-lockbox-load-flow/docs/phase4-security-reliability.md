# Phase 4 Security and Reliability Controls

This phase adds gateway-level guardrails for security enforcement and runtime resilience.

## Implemented Controls

1. Optional JWT enforcement with role checks
2. Route-level access policy map by service
3. In-memory rate limiting per client IP
4. Circuit-breaker behavior per upstream route
5. Upstream timeout protection
6. Correlation ID propagation to downstream services

## Gateway Environment Flags

1. REQUIRE_AUTH
2. JWT_PUBLIC_KEY
3. JWT_ISSUER
4. JWT_AUDIENCE
5. RATE_LIMIT_WINDOW_MS
6. RATE_LIMIT_MAX_REQUESTS
7. CIRCUIT_FAILURE_THRESHOLD
8. CIRCUIT_OPEN_MS
9. UPSTREAM_TIMEOUT_MS

## Operational Notes

1. Keep REQUIRE_AUTH=false during local smoke testing unless valid RS256 tokens are available.
2. Switch REQUIRE_AUTH=true in integration or production-like runs.
3. Tune rate limit and circuit threshold values per load profile.
4. Use /health to inspect current circuit state and effective limits.
