# Sample Workflow

## 1. Participants & Identifiers

| **Identifier** | **Participant Name** | **Description** |
| ---------------- | ---------------------- | ----------------- |
| **A** | App | Submits Entities 1 & 2 for matching |
| **B** | Service B | Creates Entity 1 and emits created event |
| **C** | Service C | Processes submission, validation and emits submitted event |
| **D** | Event‑Sink D | Entity submission |
| **E** | Engine E | Matching engine |

## 2. Textual Descriptions of Sample Activities

**1. Entity 1 Creation**  
Validate, submit Entity 1 from App and emit event if successful.

**2. Entity 2 Submission**  
Validation and submission of Entity 2 and matching of entity parts for reconciliation
