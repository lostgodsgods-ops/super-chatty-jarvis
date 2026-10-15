# Super Chatty Jarvis — Architecture Expansion

## Status and scope

This document describes modular foundations, not a claim that every named model, MCP server, or vector database is connected. The Cloudflare Worker currently has Workers AI chat, Tavily search, PBKDF2-SHA-256 owner authentication, D1-backed durable knowledge tasks, KV sessions, and a 15-minute Cron schedule.

## Middleware pipeline

The architecture foundation provides an ordered middleware pipeline, explicit side-effect approval validation, and a finite step budget. Production wiring must keep authorization before provider calls and tool execution. Untrusted search content is data, never instructions. Any action without an implemented executor remains unavailable.

Conceptual layers:
1. Classical/rule-based policy
2. Retrieval and memory
3. Statistical/model inference
4. LLM and multimodal provider adapters
5. Planning and bounded task orchestration
6. Tool/MCP integration with allowlists
7. Agentic coordination, audit, evaluation and rollback

These are engineering layers, not a claim of AGI or autonomous general intelligence.

## Provider registry

The architecture/provider-router module registers model families and exposes implementation/configuration status. Workers AI and Tavily are the only currently implemented provider paths represented as implemented. OpenAI, Claude, Gemini, hosted Llama, LCM, LAM, MoE, VLM, SLM, MLM and SAM entries fail closed until an adapter and tests are added.

## MCP and vector adapters

The integration registry declares configuration slots for GitHub, PostgreSQL, filesystem and custom MCP servers, plus Pinecone, Qdrant, Milvus, Chroma and pgvector. It does not connect to arbitrary URLs or execute tools. Even configured integrations return an explicit not-implemented result until transport, authentication, server allowlists, tool schemas, timeout limits, audit, and permission enforcement are implemented.

Cloudflare KV is appropriate for small key/value state and sessions; D1 is relational task/audit storage. Neither should be described as a vector database. A future vector adapter must define embedding model/version, dimensions, owner isolation, retention/deletion, and retrieval access controls.

## Queue safety

Keep the existing 15-minute schedule and per-tick processing cap. Goal chaining should be represented as explicit persisted steps with bounded depth, per-step authorization, idempotency keys, timeouts, retry ceilings, and compensating rollback metadata. Reflection may propose revisions but must not grant permissions, alter approval scope, or autonomously retry side effects.

## Frontend migration

The existing root index.html and Cloudflare static Worker remain the production entry point during migration. A modular PWA layout can be introduced incrementally under src/ (api, components/layout, ui, context, data, hooks, pages, services, utils) while preserving the existing route and adding build/smoke tests before switching deployment output. Do not delete or replace the live entry point until the built artifact passes staging checks.

## Acceptance criteria

- Unit tests verify provider fail-closed behavior, owner approval checks, finite budgets, and disabled integration states.
- Every provider marked implemented has a real adapter and live smoke test.
- MCP tool calls are restricted to explicit server/tool allowlists; no caller-supplied arbitrary URL.
- Vector backends are reported as configured-but-unverified until an authenticated round-trip test succeeds.
- Queue tests cover exact-scope approval, one-time nonce replay, retry ceiling, idempotency, audit trail, and compensation metadata.
- Deploy only after required checks pass. A green CI run is not proof of zero downtime or complete security.
