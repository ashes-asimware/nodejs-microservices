# 🚚 Transportation Payment Reconciliation Workflow (AP + AR + Lockbox)

(Designed for: Carriers, Brokers, Factoring, Load‑based settlement, ACH/EFT, Fuel Cards, Event‑Sourced Ledger)

## 🧩 1. Participants & Identifiers

| **Identifier** | **Participant Name** | **Description** |
|----------------|----------------------|-----------------|
| **C** | Carrier | The trucking company hauling the load and submitting invoices, PODs, BOs, and receiving settlements or fuel advances. |
| **F** | Factor | The factoring company purchasing the carrier’s receivables, issuing advances, and receiving final settlements from the broker. |
| **B** | Broker | The freight broker or 3PL managing loads, approving settlements, and issuing payments to carriers or factors. |
| **Ld** | Load Service | Manages load lifecycle: creation, pickup/delivery data, POD/BO storage, and load‑level metadata. |
| **Inv** | Invoice Service | Handles invoice submission, validation, linking to loads, and preparing AR records. |
| **Fac** | Factoring Service | Manages factoring assignments, advances, reserves, fees, and factor‑specific settlement logic. |
| **Pay** | Payment Orchestration Service | Central service for initiating AP payments, generating NACHA/EFT files, and coordinating outbound settlement. |
| **Fuel** | Fuel Card Service | Issues fuel advances, tracks fuel card charges, rebates, and offsets during settlement. |
| **Lock** | Lockbox Ingestion Service | Processes image‑only lockbox files, extracts check/remittance data, and forwards to ML for matching. |
| **Bank** | Bank / Lockbox Bank | External financial institution handling ACH/EFT settlements, lockbox processing, and inbound/outbound payment confirmations. |
| **Recon** | Reconciliation Engine (ML + Rules) | Performs ML‑assisted matching of payments to invoices/loads, handles exceptions, and drives reconciliation workflows. |
| **Led** | Event‑Sourced Ledger | Immutable event store capturing all financial events and deriving ledger entries from them. |
| **Ent** | Entity Accounting Engine | Applies multi‑entity accounting rules, intercompany postings, and ensures correct entity‑level financial treatment. |

## 🧵 2. Textual Descriptions of All 17 Activities

**1. Load Creation**
The carrier begins the process by creating a load in the system and uploading supporting documents such as the Bill of Lading (BO) and Proof of Delivery (POD). The Load Service records the operational details and emits a `LoadCreated` event to the event‑sourced ledger, establishing the foundational entity‑scoped record for all future financial and operational events tied to that load.

**2. Invoice Submission**
Once the load is delivered, the carrier submits an invoice along with the POD and BO. The Invoice Service validates the submission, links it to the load, and emits an `InvoiceSubmitted` event. The ledger derives an initial AR entry for the carrier’s entity, establishing the receivable that the broker owes for the completed load.

**3. Factoring Assignment**
If the carrier uses a factoring company, they assign the invoice to the factor. The Factoring Service records this assignment and emits a `FactoringAssignment` event. The ledger reclassifies the receivable from the carrier to the factor, ensuring that future payments are correctly routed and accounted for under multi‑entity rules.

**4. Factor Advance to Carrier**
The factor may issue an advance to the carrier before the broker pays the invoice. When the factor approves and disburses the advance, a `FactoringAdvancePaid` event is emitted. The ledger posts an AP entry from the factor to the carrier, reflecting the early funding and reducing the carrier’s outstanding receivable.

**5. Broker AP Authorization**
The broker reviews the invoice and supporting documents and authorizes payment to either the carrier or the factor. The Payment Orchestration Service emits a `PaymentAuthorized` event, signaling that the AP obligation is approved and ready for disbursement. This step ensures auditability and separation of duties.

**6. Payment Initiation (ACH/EFT)**
The broker initiates the outbound payment through ACH or EFT. The Payment Orchestration Service sends the payment instructions to the bank and emits a `PaymentInitiated` event. The ledger records a debit to AP and a credit to Cash‑in‑Transit, reflecting that funds have been committed but not yet settled.

**7. Fuel Card Advance**
If the carrier receives a fuel advance tied to the load, the Fuel Card Service issues the advance and emits a `FuelCardAdvanceIssued` event. The ledger records a carrier advance liability and a corresponding cash reduction. These advances will later be offset against the carrier’s settlement.

**8. Bank Settlement of Outbound Payment**
The bank processes the ACH/EFT file and confirms settlement. The Payment Orchestration Service receives the confirmation and emits a `PaymentSettled` event. The ledger moves the amount from Cash‑in‑Transit to Cash, completing the AP payment lifecycle.

**9. Intercompany Settlement (Multi‑Entity)**
If the entity that owns the bank account differs from the entity that owes the AP, the Entity Accounting Engine generates an `IntercompanySettlement` event. This creates due‑to/due‑from entries between entities, ensuring accurate multi‑entity financial reporting and eliminating cross‑entity imbalances.

**10. Inbound Customer Payment**
The broker receives payment from the shipper or customer via ACH/EFT. The Payment Ingestion layer emits a `PaymentReceived` event. This event triggers the reconciliation process, as the system must match the inbound payment to the correct load, invoice, or factoring assignment.

**11. Lockbox Image‑Only Flow**
For customers paying by check, the bank processes the lockbox and sends check images and remittance images. The Lockbox Ingestion Service emits a `LockboxFileReceived` event and forwards the images to the ML engine for OCR and extraction. This enables automated matching even when remittance data is incomplete or unstructured.

**12. ML‑Assisted Matching**
The Reconciliation Engine analyzes all relevant events—invoice submissions, factoring assignments, payment receipts, and lockbox extractions. Using ML and rules, it attempts to match payments to invoices or loads. High‑confidence matches generate a `PaymentMatched` event; low‑confidence cases create an `UnappliedCashCreated` event for manual review.

**13. Payment Application**
Once a payment is matched, the ledger applies it to the correct AR record via a `PaymentApplied` event. If the invoice was factored, the payment is applied to the factor’s receivable; otherwise, it clears the carrier’s AR. The ledger posts the appropriate cash and AR entries, ensuring accurate financial treatment.

**14. Factor Final Settlement**
After the broker pays the factor, the factoring company calculates reserve releases and fees. The Factoring Service emits a `FactoringSettlementCompleted` event. The ledger posts adjustments for reserves, fees, and final settlement amounts, completing the factoring lifecycle.

**15. Fuel Card Offset During Settlement**
When settling with the carrier, the broker retrieves outstanding fuel card advances. The Payment Orchestration Service emits a `FuelCardChargeSettled` event, and the ledger offsets the carrier’s AP with the fuel advance liability. This ensures that fuel advances reduce the carrier’s final payout.

**16. Reconciliation Completion**
After all payments, matches, and adjustments are processed, the Reconciliation Engine emits a `ReconciliationCompleted` event. This signals that AR, AP, cash, and intercompany positions are fully updated and balanced for the batch, ensuring financial completeness and audit readiness.

**17. Manual Review & Correction**
Any unmatched or low‑confidence items enter an exception queue. A broker or accounting user reviews the items and approves corrections or manual matches. The Reconciliation Engine emits a `ManualAdjustmentCreated` event, and the ledger posts new entries—never overwriting history—to maintain full auditability in the event‑sourced system.
