---
adr: "0001"
title: SQLite (WAL) instead of PostgreSQL
status: accepted
date: 2026-05-15
---

## Context

The service runs as two containers (API + worker) that share a single persistent database. Options considered were PostgreSQL (containerised or managed), SQLite, and Redis (for lightweight job tracking only).

## Decision

Use SQLite with WAL journal mode (`PRAGMA journal_mode=WAL`).

## Rationale

- **Single-file simplicity**: no separate DB container, no connection pooling, no migrations runner needed at this stage.
- **WAL allows concurrent readers**: the API container and worker both query the `jobs` and `links` tables frequently. WAL gives reader–writer concurrency without locks.
- **One writer at a time is fine**: the worker is the only heavy writer. The API writes only on job creation and chat_state updates, which are infrequent.
- **Greenfield note**: the schema is applied with `CREATE TABLE IF NOT EXISTS`. Post-launch schema changes use one-off `ALTER TABLE` scripts (see PRD §14.1).

## Trade-offs

- Not horizontally scalable (single file). If the service ever runs multiple worker replicas, this breaks.
- No built-in connection pooling; `aiosqlite` opens a connection per operation. Acceptable at current volume.

## Consequences

- `DB_PATH` must be on a shared Docker volume (`./data:/app/data`).
- Both containers mount the same volume; Docker's single-host constraint keeps this safe.
