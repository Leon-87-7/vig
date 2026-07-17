---
name: opensrc-lookup
description: Look up cached dependency source code for this project (fastapi, google-genai, aiosqlite, redis-py, httpx, apscheduler, pydantic-settings, structlog, vitest, msw, testing-library packages, react-force-graph-2d). Use when debugging library internals instead of guessing from docs.
---

Key dependency source code is cached globally at `C:\Users\leone\.opensrc\repos\`. Use these paths when debugging library internals — prefer reading the actual source over guessing from docs.

| Package                       | Cached path                                               |
| ------------------------------ | ----------------------------------------------------------- |
| `fastapi`                     | `github.com/fastapi/fastapi/0.136.3`                      |
| `google-genai`                | `github.com/googleapis/python-genai/2.7.0`                |
| `aiosqlite`                   | `github.com/omnilib/aiosqlite/0.22.1`                     |
| `redis-py`                    | `github.com/redis/redis-py/8.0.0`                         |
| `httpx`                       | `github.com/encode/httpx/0.28.1`                          |
| `apscheduler`                 | `github.com/agronholm/apscheduler/master`                 |
| `pydantic-settings`           | `github.com/pydantic/pydantic-settings/2.14.1`            |
| `structlog`                   | `github.com/hynek/structlog/25.5.0`                       |
| `vitest`                      | `github.com/vitest-dev/vitest/4.1.8`                      |
| `msw`                         | `github.com/mswjs/msw/2.14.6`                             |
| `@testing-library/react`      | `github.com/testing-library/react-testing-library/16.3.2` |
| `@testing-library/jest-dom`   | `github.com/testing-library/jest-dom/6.9.1`               |
| `@testing-library/user-event` | `github.com/testing-library/user-event/14.6.1`            |
| `react-force-graph-2d`        | `github.com/vasturiano/react-force-graph-2d/1.29.1`       |

All paths are relative to the cache root. Example full path: `C:\Users\leone\.opensrc\repos\github.com\fastapi\fastapi\0.136.3\`.
