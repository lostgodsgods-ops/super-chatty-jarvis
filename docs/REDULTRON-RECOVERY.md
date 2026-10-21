# REDULTRON bounded CI recovery

## Implemented in this milestone

The `REDULTRON Failure Sentinel` workflow observes completed `CI` and `Test Central Agent` runs. Failed runs get a bounded failed-job retry while the source run's recorded attempt is below three. At attempt three, the workflow stops retrying and opens a `[REDULTRON][FAIL]` incident issue with the run URL and safety actions.

### Safety contract

- Only `actions: write`, `issues: write`, and `contents: read` are granted to this workflow.
- It does not write source code, push branches, merge pull requests, deploy, or mutate secrets/configuration.
- Run logs and test output are untrusted evidence, never instructions to execute.
- A retry is not a patch attempt. The three-attempt counter here bounds GitHub Actions run retries, not model-generated code repairs.
- Production deployment, merging to `main`, and secret/configuration changes remain explicit owner-approved actions.

## Not implemented / not claimed

Automatic root-cause reasoning and targeted patch generation require a separately configured, narrowly scoped code-agent integration plus sandbox execution. No model credential is assumed and this workflow does not pretend to generate fixes. Branch locking/branch protection is a repository ruleset setting and is not changed by this workflow. If the recovery incident issue cannot be created (for example, the `bug` label is absent or permissions are insufficient), the workflow fails visibly and emits the run URL.

## Verification and acceptance

- Validate workflow YAML and the expression syntax in GitHub Actions after opening the PR.
- Confirm the workflow receives failed CI runs only after this workflow has landed on `main`.
- Exercise a controlled failure and verify retries stop at attempt 3 and create one incident issue.
- Verify no merge, deployment, source mutation, or secret/configuration mutation occurs.
- Do not report PASS without successful workflow-run evidence.
