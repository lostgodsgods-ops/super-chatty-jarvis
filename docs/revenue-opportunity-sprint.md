# REDULTRON CORE 3.0 — Revenue Opportunity Sprint (Simulation/Research Only)

## Objective
Find legitimate, low-cost ways to earn revenue for the Super Chatty Core project. This is a task brief for the registered agent slots, not evidence that agents are provisioned or running.

## Dispatch state
- Registry agent slots: 90
- Provisioned agents: 0 (per current registry)
- Automatic dispatch: disabled
- Live payments, transfers, trades, and blockchain broadcasts: disabled
- Execution mode: research and simulation only until the orchestrator and authenticated task/result path are verified.

## Work allocation

### Group A — Privacy & Security (AGENT-01–AGENT-20)
1. Identify privacy, security, and configuration risks in each proposed revenue opportunity.
2. Reject offers requiring upfront deposits, seed phrases/private keys, account takeover, suspicious downloads, or secret disclosure.
3. Produce a short risk report and keep only minimum necessary public information.
4. Never erase required audit evidence or claim “zero trace”; redact sensitive data and retain security-relevant audit records.

### Group B — Market Data & Treasury Simulation (AGENT-21–AGENT-45)
1. Collect public, attributable market and ecosystem data only where permitted.
2. Compare legitimate project revenue routes: paid software features, transparent service work, grants, bug bounties with published rules, and opt-in donations/sponsorship.
3. Model costs, fees, eligibility, estimated effort, uncertainty, and expected net revenue; label estimates as estimates.
4. Use mock balances and simulated transactions only. Do not trade, transfer funds, connect a wallet, or initiate payments.
5. Never request, store, or expose a wallet seed phrase, private key, recovery code, or exchange credential.

### Group C — Delivery & Task Preparation (AGENT-46–AGENT-75)
1. Search for legitimate, public opportunities and official application instructions.
2. Rank opportunities by fit, eligibility, time-to-value, cost, and risk.
3. Prepare draft proposals, small deliverable plans, demos, or code changes in a branch for human review.
4. Do not submit applications, publish offers, send messages, merge protected branches, or deploy to production without explicit authorization.
5. Deduplicate findings and produce structured results with source, date checked, requirements, deadline, estimated effort, expected gross/net value, and risks.

### Group D — Verification & Shield (AGENT-76–AGENT-90)
1. Independently verify source legitimacy, terms, eligibility, deadlines, and payout methods.
2. Check calculations, assumptions, duplicate opportunities, and conflicts of interest.
3. Reject scams, deceptive schemes, unauthorized access, money-mule requests, laundering, and opportunities that violate platform rules or law.
4. Produce a final evidence-backed shortlist; no agent may approve its own high-risk recommendation.

## Required output for every opportunity
- Opportunity name and official source
- Type: paid service / grant / bounty / sponsorship / donation / other
- Eligibility and required deliverable
- Deadline and date verified
- Estimated effort and out-of-pocket cost
- Expected gross revenue and estimated fees (ranges; state assumptions)
- Estimated net revenue and confidence level
- Safety, privacy, legal, and platform-rule risks
- Recommended next step: RESEARCH_MORE / DRAFT_ONLY / HUMAN_REVIEW / REJECT

## Approval and money handling
- Research and simulation do not authorize execution.
- A human owner must review the opportunity and its terms before any commitment.
- Payments may only be received through a legitimate account or wallet controlled by the project owner, using official payout instructions.
- Never give agents unrestricted wallet authority. Never share wallet secrets with an agent or paste them into chat, source code, CI logs, or issue trackers.
- No live payment, trade, blockchain transaction, API-billing change, or production deployment is permitted by this task brief.


## Target Wallet Authority Model — Incoming Only

This section records the requested target architecture. It does **not** mean a wallet has been connected or that any agent is running.

```mermaid
graph TD
    A[Commander — approval authority] -->|Controls and approves| B[Commander Wallet — outgoing authority]
    subgraph REDULTRON CORE 3.0 — Autonomous Swarm Target
      C[90 registered agent slots] -->|Research and earn through authorized work only| D[REDULTRON Core Wallet — incoming-only target]
    end
    D -->|Owner-controlled deposit/settlement after verification| B
```

### Non-negotiable wallet controls
- Agent slots may research opportunities, prepare deliverables, and report verified revenue routes; this is not permission to access accounts or move money.
- Agents must never receive seed phrases, private keys, recovery codes, exchange credentials, or unrestricted wallet permissions.
- The Core wallet target is **incoming-only** for agents. Agents cannot initiate withdrawals, transfers, trades, token approvals, contract calls, or spending.
- Any transfer from the Core wallet to the Commander wallet must be initiated or explicitly approved by the owner through an authenticated, independently verified flow. Do not implement automatic sweeping until ownership, network, address, fee, and confirmation checks are tested.
- Never accept funds from suspicious sources, money-mule requests, stolen accounts, deceptive schemes, or transactions with unclear origin. Reject and escalate rather than forwarding funds.
- Before any real wallet integration, require chain/network allowlisting, address verification, deposit monitoring, idempotency, replay protection, fee limits, audit records, emergency stop, and a tested recovery path.
- Current mode remains research/simulation-only. Do not claim the target wallet path is live until end-to-end tests prove it.

### Revenue-opportunity triage
1. Prefer no-upfront-cost routes tied to real project value: paid software/service deliverables, eligible grants, transparent sponsorships/donations, and published bounty programs whose terms allow participation.
2. Verify the official source, eligibility, deliverable, deadline, payout method, fees, and restrictions before ranking an opportunity.
3. Treat cloud credits or promotional credits as **non-cash value**, not wallet currency; verify whether they are transferable or redeemable before counting them.
4. Reject offers promising guaranteed returns, requiring deposits to unlock earnings, requesting secrets, or asking the project to receive and forward third-party money.
5. Produce a shortlist and draft materials only. Submission, account creation, contract acceptance, and any financial transaction remain human-approved actions.

## Current blockers
The last recorded Live Gateway Probe failed its authenticated hybrid endpoint with HTTP 401 `OWNER_AUTH_REQUIRED`. The policy module is a decision function, not an executor. Do not claim autonomous dispatch until authentication, task intake, result persistence, audit logging, retry bounds, and emergency-stop behavior are tested end-to-end.

## Success criteria
1. A verified shortlist of legitimate opportunities with primary-source evidence.
2. Reproducible net-revenue estimates with assumptions.
3. Security review and independent verification.
4. A human-reviewed next-step recommendation.
5. No live funds moved and no secrets exposed during the research sprint.
