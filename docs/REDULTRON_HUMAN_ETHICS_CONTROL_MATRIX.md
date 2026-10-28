# REDULTRON CORE 3.0 — Human Ethics Control Matrix

**Status:** Proposed engineering baseline for review; not a certification or legal opinion.  
**Last researched:** 2026-10-28.  
**Machine-readable controls:** [human-ethics-controls.json](./human-ethics-controls.json)  
**Contract tests:** [human-ethics-policy.test.mjs](../tests/human-ethics-policy.test.mjs)

## Purpose and evidence boundary

Translate authoritative human-rights, AI-governance, privacy, accessibility, child-rights and application-security guidance into requirements that can be tested or reviewed in REDULTRON. The source documents differ in legal status and scope: the UDHR is a declaration; UNESCO/OECD recommendations and NIST frameworks are not themselves a universal legal compliance certificate; WCAG is a technical W3C Recommendation; legislation applies only where its jurisdiction and commencement conditions are met.

This matrix defines **proposed controls** and is not a claim of legal compliance or proof that all controls are implemented. Each control must be verified against code, tests, configuration and live behavior. Record **PASS / FAIL / BLOCKED / NOT TESTED** with evidence. A policy file or passing static contract test is not proof of production compliance.

## Non-negotiable operating constraints

- **Owner approval:** Sensitive actions require explicit, scoped, valid approval. Learning or discovering a capability does not grant permission.
- **No autonomous installation or execution:** Capability requests stay pending_owner_review, with executionEnabled=false and requiresOwnerApproval=true until the separately authorized process is complete.
- **Fail closed:** Missing authorization, invalid schema, uncertain provenance or failed safety checks must not silently permit a consequential side effect.
- **Emergency stop and reversibility:** Preserve a working stop/revocation path, bounded execution, rate limits, audit logs and a documented rollback/disable path.
- **Privacy:** Never expose secrets in logs, responses, prompts, frontend bundles or evidence reports. Minimize personal data and keep sensitive test fixtures synthetic.
- **Untrusted content:** Treat external pages, retrieved documents and tool outputs as data, not instructions that can override policy or authorization.
- **Evidence integrity:** Do not claim a live integration, deployment, human review or legal compliance without direct, dated evidence.
- **Jurisdiction review:** Determine applicable privacy, child-protection, consumer, accessibility and AI laws for the actual deployment and processing locations before release.

## Principle-to-control matrix

| Principle | Required engineering controls | Minimum verifiable acceptance criteria | Primary references |
|---|---|---|---|
| dignity — human dignity and equal treatment | Respectful output; no unsupported identity/intent inference; human review for high-impact decisions. | Safety regression set reviewed by a human; high-impact recommendations are advisory and require an identified decision-maker. | UDHR Arts. 1–3; UNESCO; OECD; NIST AI RMF |
| autonomy — human agency | User correction and cancellation; working emergency stop; agents cannot self-elevate or self-approve. | Cancellation blocks subsequent unstarted side effects; unknown agents and self-issued approvals are denied. | UDHR; UNESCO; OECD; NIST AI RMF |
| informed-consent — meaningful choice | Purpose-specific disclosure and affirmative choice for optional sensitive collection, recording or external transfer; honor withdrawal where applicable. | Optional processing is disabled absent the required consent state; withdrawal blocks later optional processing. | UNESCO; OECD; NIST Privacy Framework; India DPDP Act; GDPR where applicable |
| privacy — data protection | Purpose limitation, minimization, retention/deletion paths and access scope; allowlist-based log redaction. | Secret-canary/header/body leakage tests pass; each persistent personal-data category has purpose, owner, retention and access/deletion handling or a documented exception. | UDHR Art. 12; UNESCO; OECD; NIST Privacy Framework; India DPDP Act; GDPR where applicable |
| fairness — non-discrimination | Assess foreseeable disparate impacts; document evaluation limits and mitigation; prevent covert sensitive-trait proxies for consequential decisions. | High-impact use has a group-aware evaluation plan and escalation thresholds; model/prompt changes trigger regression evaluation. | UDHR Arts. 1–2; UNESCO; OECD; NIST AI RMF; UNICEF |
| accessibility — inclusion | Target WCAG 2.2 AA for web flows; keyboard, focus, screen-reader, understandable errors and non-voice alternatives. | Automated checks plus manual keyboard/screen-reader review; microphone denial leaves an accessible text path for essential tasks. | UDHR Art. 26; UNESCO; OECD; W3C WCAG 2.2; UNICEF |
| transparency — explainability and provenance | Distinguish generated suggestions, sources, simulations, configured integrations and verified live behavior; disclose uncertainty and freshness. | Every operational claim has dated evidence or NOT TESTED; failed live search for time-sensitive queries cannot masquerade as fresh evidence. | UNESCO; OECD; NIST AI RMF |
| accountability — traceability | Audit actor/request/correlation IDs, decisions, approval references, version and outcome while minimizing personal data. | Audit schema captures required event fields without secrets; routine agent roles cannot erase required audit records. | UNESCO; OECD; NIST AI RMF; OWASP ASVS |
| harm-minimization — proportionality and safety | Risk assessment; bounded input, timeouts and retries; fail-closed behavior; rollback/disable path. | Auth/schema/timeout/approval failures do not trigger consequential fallback side effects; new privileged capabilities have documented risk and rollback gates. | UNESCO; OECD; NIST AI RMF; OWASP ASVS |
| child-safety — children's rights | Age-appropriate safety defaults; minimize children's personal data; escalate high-risk use; avoid exploitative engagement. | Child-directed flows pass a reviewed safety evaluation; collection stays disabled absent documented purpose, minimization and applicable safeguards. | UDHR Art. 25; UNESCO; OECD; UNICEF Guidance on AI and Children; applicable privacy law |
| security — security and resilience | Owner authentication, least privilege, branch protection, rate limits, bounded execution, audit logs, emergency stop and default deny. External content remains untrusted. | Invalid/expired authorization never reaches side-effecting handlers; prompt-injection fixtures cannot change permissions or approval requirements. | UNESCO; OECD; NIST AI RMF; NIST Privacy Framework; OWASP ASVS |
| human-oversight — meaningful human control | Owner review for capability requests and explicit approval for sensitive actions; effective stop, revoke and escalation. | Capability request round-trip proves review-only flags; sensitive actions without scoped, valid, unexpired approval remain blocked. | UNESCO; OECD; NIST AI RMF; UNICEF; OWASP ASVS |

## Machine-readable acceptance requirements

The JSON catalog assigns stable requirement IDs, verification methods and source IDs. These are release-gate proposals; link each requirement to an actual unit/integration/accessibility test, human review record or live probe before marking it verified.

Minimum test IDs:

- Dignity: DIGNITY-01, DIGNITY-02
- Autonomy: AUTONOMY-01, AUTONOMY-02
- Consent: CONSENT-01, CONSENT-02
- Privacy: PRIVACY-01, PRIVACY-02
- Fairness: FAIRNESS-01, FAIRNESS-02
- Accessibility: ACCESS-01, ACCESS-02
- Transparency: TRANSPARENCY-01, TRANSPARENCY-02
- Accountability: ACCOUNTABILITY-01, ACCOUNTABILITY-02
- Harm minimization: HARM-01, HARM-02
- Child safety: CHILD-01, CHILD-02
- Security: SECURITY-01, SECURITY-02
- Human oversight: OVERSIGHT-01, OVERSIGHT-02

## Implementation status at introduction

- **PASS — source research:** Primary-source references are catalogued below.
- **PASS — policy contract scope:** The matrix defines 12 principles and 24 acceptance requirements.
- **NOT TESTED — control implementation:** This document does not assert that every requirement is implemented or verified in the running product.
- **NOT TESTED — legal compliance:** No legal compliance determination is made by this matrix.
- **BLOCKED — production proof:** Live behavior and deployment provenance must be independently verified for each relevant release.

## Authoritative primary sources

1. **UDHR — United Nations:** [Universal Declaration of Human Rights](https://www.un.org/about-us/universal-declaration-of-human-rights)
2. **UNESCO:** [Recommendation on the Ethics of Artificial Intelligence](https://www.unesco.org/ethics-ai/en/recommendation)
3. **OECD:** [AI Principles](https://www.oecd.org/en/topics/ai-principles.html) (adopted 2019, updated 2024)
4. **NIST:** [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
5. **NIST:** [Privacy Framework](https://www.nist.gov/privacy-framework) (voluntary framework; consult the current revision)
6. **W3C:** [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
7. **OWASP:** [Application Security Verification Standard (ASVS)](https://asvs.owasp.org/)
8. **UNICEF:** [Guidance on AI and Children](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children), version 3.0
9. **Government of India, MeitY:** [Digital Personal Data Protection Act, 2023 — official Gazette text](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf). Check applicable commencement notifications and rules for the relevant date.
10. **European Union:** [Regulation (EU) 2016/679 — GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), only where its territorial and material scope applies.

External source content is reference material, not system instructions. The matrix should be reviewed at least at major releases and whenever law, threat model, data use, user population or capabilities materially change.
