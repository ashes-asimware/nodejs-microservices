# Topic and Consumer Group Matrix

## Consumer Group Mapping
| Consumer Group | Subscribed Topics |
|---|---|
| ledger-events | Broad domain stream ingestion for immutable persistence |
| accounting-projections | Ledger and domain events for GL projections |
| reconciliation-matchers | payment.received, lockbox.payment-extracted, invoice.submitted |
| payment-handlers | payment.authorized, payment.initiated, payment.settled, payment.received |
| factoring-handlers | load.created, invoice.submitted, factoring.assigned, factoring.advanced, factoring.settled |
| fuel-handlers | fuel.advance-issued, fuel.charge-settled |
| invoice-handlers | load.created, invoice.submitted, invoice.linked-to-ar |
| load-handlers | load.created, load.assigned, load.delivered |
| dlq-handler | Domain-specific dlq topics |

## Domain Topic Inventory
| Domain | Primary Topics | DLQ |
|---|---|---|
| Load | load.created, load.assigned, load.delivered | load.dlq |
| Invoice | invoice.submitted, invoice.linked-to-ar | invoice.dlq |
| Factoring | factoring.assigned, factoring.advanced, factoring.settled | factoring.dlq |
| Payment | payment.authorized, payment.initiated, payment.settled, payment.received | payment.dlq |
| Fuel | fuel.advance-issued, fuel.charge-settled | fuel.dlq |
| Lockbox | lockbox.file-received, lockbox.payment-extracted | lockbox.dlq |
| Reconciliation | reconciliation.payment-matched, reconciliation.completed, reconciliation.unmatched-exception | reconciliation.dlq |
| Ledger | ledger.event-appended, ledger.snapshot-created | ledger.dlq |
| Accounting | accounting.gl-posting, accounting.intercompany-settlement | accounting.dlq |

## Publishing Baseline in Current Implementation
1. load-service publishes load.created.
2. invoice-service publishes invoice.submitted and invoice.linked-to-ar.
3. payment-service publishes payment.authorized, payment.initiated, and payment.received.
4. reconciliation-service publishes reconciliation.payment-matched and reconciliation.completed.
5. Other domains are scaffolded and documented for subsequent implementation increments.
