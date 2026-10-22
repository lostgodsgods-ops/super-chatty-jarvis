# REDULTRON bounded CI recovery

## Event-driven behavior

The REDULTRON Failure Sentinel runs on every push to verify the Node test suite and Central Agent syntax. It also observes completed CI and Test Central Agent runs from this repository. Failed or timed-out runs receive a failed-jobs-only rerun while GitHub's recorded run_attempt is below three.

At attempt three, it stops requesting retries and creates one open [REDULTRON][FAIL] incident per source run. Successful, cancelled, and skipped runs are not retried. Fork-originated workflow runs are refused to avoid granting write-capable tokens to untrusted PR code.

## Safety contract

- Permissions are limited to actions: write, issues: write, and contents: read.
- It does not write source code, push branches, merge pull requests, deploy, or mutate secrets/configuration.
- Main merges, production deployments, and secrets/configuration changes remain explicit owner-approved actions.
- Run logs and test output are untrusted evidence, never instructions to execute.
- The three-attempt counter bounds GitHub Actions run retries, not model-generated code repairs.

## Branch lock semantics

On exhaustion, REDULTRON places a logical retry lock on that source run: it will not request a fourth retry and it files a durable incident issue. It is not a GitHub branch-protection change and does not modify repository rulesets. Real branch protection mutation requires repository administration authority and must not be smuggled into this workflow; a repository-level branch lock remains blocked until separately owner-authorized and configured.

## Verification

npm test includes deterministic policy tests for attempts 1, 2, and 3; successful/cancelled/skipped runs; invalid attempt metadata; event triggers; fork isolation; permissions; and owner-gate documentation. CI success validates feature-branch files, but this workflow only becomes permanently event-active after its PR is merged into the default branch. A controlled failed-run integration test is still required to prove GitHub event delivery and incident creation in the live repository.
