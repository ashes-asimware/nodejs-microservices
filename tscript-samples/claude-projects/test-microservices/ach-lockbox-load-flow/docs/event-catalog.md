# Event Catalog

## Envelope Contract
All domain events use a common envelope with fields for id, correlationId, source, type, version, timestamp, entityId, userId, and payload.

## Load Domain
| Event Type | Topic | Purpose |
|---|---|---|
| load.created | load.created | Load submitted and initialized |
| load.assigned | load.assigned | Load assigned to servicing party |
| load.delivered | load.delivered | Load delivery completion |

## Invoice Domain
| Event Type | Topic | Purpose |
|---|---|---|
| invoice.submitted | invoice.submitted | Invoice submitted for AR lifecycle |
| invoice.linked-to-ar | invoice.linked-to-ar | Invoice linked to AR record |

## Factoring Domain
| Event Type | Topic | Purpose |
|---|---|---|
| factoring.assigned | factoring.assigned | Factoring assignment creation |
| factoring.advanced | factoring.advanced | Advance disbursement |
| factoring.settled | factoring.settled | Final factor settlement |

## Payment Domain
| Event Type | Topic | Purpose |
|---|---|---|
| payment.authorized | payment.authorized | Broker-side payment authorization |
| payment.initiated | payment.initiated | ACH/EFT initiation |
| payment.settled | payment.settled | Settlement confirmed |
| payment.received | payment.received | Inbound cash receipt |

## Fuel Domain
| Event Type | Topic | Purpose |
|---|---|---|
| fuel.advance-issued | fuel.advance-issued | Fuel advance issued |
| fuel.charge-settled | fuel.charge-settled | Fuel offset/settlement completed |

## Lockbox Domain
| Event Type | Topic | Purpose |
|---|---|---|
| lockbox.file-received | lockbox.file-received | Lockbox batch ingestion |
| lockbox.payment-extracted | lockbox.payment-extracted | Extracted payment/remittance from lockbox artifacts |

## Reconciliation Domain
| Event Type | Topic | Purpose |
|---|---|---|
| reconciliation.payment-matched | reconciliation.payment-matched | Payment matched to target invoice/load |
| reconciliation.completed | reconciliation.completed | Reconciliation run completion |
| reconciliation.unmatched-exception | reconciliation.unmatched-exception | Unmatched/exception flow |

## Ledger Domain
| Event Type | Topic | Purpose |
|---|---|---|
| ledger.event-appended | ledger.event-appended | Event committed to immutable store |
| ledger.snapshot-created | ledger.snapshot-created | Snapshot generated |

## Accounting Domain
| Event Type | Topic | Purpose |
|---|---|---|
| accounting.gl-posting | accounting.gl-posting | Accounting posting created |
| accounting.intercompany-settlement | accounting.intercompany-settlement | Intercompany balancing event |

## Dead Letter Topics
Each domain has a DLQ topic convention to isolate poison messages and preserve replayability. Current constants include load.dlq, invoice.dlq, factoring.dlq, payment.dlq, fuel.dlq, lockbox.dlq, reconciliation.dlq, ledger.dlq, and accounting.dlq.
