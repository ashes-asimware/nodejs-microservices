# Failure and Recovery Playbook

## Objectives
1. Preserve event integrity and auditability.
2. Restore service availability quickly.
3. Ensure replay-safe and idempotent behavior.

## Common Failure Modes
1. Kafka unavailable or broker partition.
2. Upstream service outage behind gateway.
3. Validation and malformed payload bursts.
4. Locked/open gateway circuits due to repeated failures.
5. Inconsistent state after partial request completion.

## Detection
1. Check /health on gateway and affected services.
2. Check /metrics for error spikes and route-level status distribution.
3. Inspect structured logs filtered by correlation ID.
4. Verify Kafka container and broker connectivity.

## Immediate Response Steps
1. Contain impact:
   - Rate-limit aggressive clients.
   - Temporarily disable non-critical traffic paths.
2. Stabilize dependencies:
   - Recover Kafka and database infrastructure first.
   - Confirm downstream service health before reopening traffic.
3. Clear gateway circuit conditions by waiting open interval or restarting service when needed.

## Recovery by Scenario
### Kafka Outage
1. Restore broker availability.
2. Validate producer connectivity logs.
3. Replay backlog from durable sources when available.
4. Confirm event publication recovery in metrics and logs.

### Downstream Service Failure
1. Recover service process.
2. Validate endpoint health.
3. Confirm gateway proxy success rates return to normal.

### Bad Payload/Validation Storm
1. Identify caller and failing route patterns.
2. Block or throttle offending source.
3. Patch schema/client and redeploy.

## Post-Incident Actions
1. Capture timeline and correlation IDs.
2. Record root cause and mitigations in team incident log.
3. Add or update tests to prevent recurrence.
4. Prioritize hardening items from recommendations document.
