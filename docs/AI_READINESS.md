# Future AI Integration Contract & Readiness Specification

> **CRITICAL ARCHITECTURAL DIRECTIVE:**
> **Artificial Intelligence is strictly NOT part of the initial version (v1).**
> Under no circumstances may third-party AI SDKs, paid AI API keys, or external LLM endpoints be embedded in the frontend code. This document serves solely as an architectural contract so that future AI capabilities can be connected safely without refactoring the core domain layer.

---

## 1. Future AI Vision & Use Cases

The future objective is to allow the user to manage their accounting via natural language text or voice notes.

### Example Prompts:
* *"Create a new project called Gulshan Heights with a budget of 5 million rupees."*
* *"Paid 45,000 cash to Babar Plumber for the shop project."*
* *"Add a purchase of 80 cement bags at 1,450 per bag from Lucky Cement on the house project."*
* *"What is the latest payment made to Tariq Electrician?"*

---

## 2. The Command Proposal & Approval Protocol

Future AI must **never** write directly to Cloud Firestore or bypass domain use cases. All AI interactions must follow the strict 10-step protocol:

```
[User Voice / Text]
         |
         v
[Future AI Agent / Parser]
         |
         v
[Typed Command Proposal (JSON)]
         |
         v
[Domain Validation & Entity Resolution]
         |
         v
[Interactive UI Preview Modal]  <--- User reviews exact changes & financial impact
         |
     [User Action]
     /           \
 [Approve]      [Reject / Edit]
    |                  |
    v                  v
[Execute via UseCase] [Discarded]
```

### Protocol Steps:
1. **Input Interpretation:** AI parses natural language into a structured JSON proposal.
2. **Entity Resolution:** Resolves informal names (e.g., "Babar") to exact contact IDs and project IDs. If ambiguous, asks the user for clarification before generating a proposal.
3. **Draft Proposal:** Generates a typed command payload adhering to the domain use-case schema.
4. **Impact Calculation:** Computes the projected balance, project budget impact, and payable change.
5. **Interactive Preview:** Surfaces a confirmation sheet showing the user:
   * Action Type (e.g., "Record Material Purchase Obligation")
   * Project: "House Construction"
   * Supplier: "Lucky Cement"
   * Quantity: "80 Bags @ PKR 1,450 = PKR 116,000"
   * Payment: "PKR 50,000 Cash paid immediately, PKR 66,000 remaining payable"
6. **Explicit User Approval:** Requires explicit user tap (`[Confirm & Post]`).
7. **Re-Approval on Edit:** Any change made to the proposal resets the approval state.
8. **Use-Case Execution:** The approved command passes through the standard `RecordPurchaseObligationUseCase`.
9. **Audit Trail:** Attaches metadata indicating the record was drafted via AI assistant and approved by user at timestamp $T$.
10. **Zero Secrets in Frontend:** The AI service must be routed through a secure, authenticated serverless backend proxy when implemented; client-side API keys are strictly forbidden.
