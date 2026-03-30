# Security Model

## Identity and Authentication
1. JWT bearer tokens are the canonical authentication mechanism.
2. Shared auth helpers validate token signature and required claims.
3. Gateway can enforce auth globally through REQUIRE_AUTH.

## Authorization
1. Route-level role policies are configured in api-gateway.
2. Allowed roles differ by downstream service route prefix.
3. Requests without required role access are rejected with forbidden responses.

## Request Context and Traceability
1. Gateway injects or propagates x-correlation-id.
2. Authenticated user context is forwarded as x-user-id, x-entity-id, and x-user-role headers.
3. Structured logs include correlation fields for request tracing.

## Defensive Controls
1. In-memory rate limiting by client key.
2. Circuit breaking by route target after configurable failure threshold.
3. Upstream timeout enforcement to prevent request hangs.

## Error and Information Exposure
1. Shared error taxonomy normalizes error responses.
2. Operational details are logged server-side with context.
3. Public responses avoid leaking internal stack details by default.

## Local vs Production Guidance
1. Local smoke tests may run with REQUIRE_AUTH=false.
2. Production and integration environments should use REQUIRE_AUTH=true.
3. JWT issuer, audience, and public key must be set per environment.
4. Rate and circuit thresholds should be tuned to expected traffic profiles.

## Security Hardening Backlog
1. Introduce key rotation policy and JWKS support.
2. Add mTLS for service-to-service calls when moving beyond local deployment.
3. Add centralized secrets management and remove plaintext development defaults.
4. Add policy-as-code checks in CI for route-role regressions.
