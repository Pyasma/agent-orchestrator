# Development Guide

How to set up, build, run, and test Agent Orchestrator locally.

## Prerequisites

| Tool      | Minimum version | Notes                                                     |
|-----------|-----------------|-----------------------------------------------------------|
| Go        | 1.25            | `go version` to check; install via [go.dev](https://go.dev/dl/) |
| Node.js   | 20              | `node --version`; install via [nodejs.org](https://nodejs.org/) |
| npm       | 10              | Ships with Node.js                                        |
| Nix (opt.)| —               | `nix develop` drops you into a shell with all deps; see `flake.nix` |

Additional runtime dependencies for the daemon:

- **git** (for worktree creation and agent integration)
- **A running agent CLI** (Claude Code, Codex, Aider, etc.) — see
  [the installation guide](https://ao-agents.com/docs/installation)

## Project Layout

```text
agent-orchestrator/
  backend/              # Go daemon (Cobra CLI, HTTP API, services, storage)
    cmd/ao/             # CLI entry point
    internal/           # All library code
      cli/              # CLI command implementations
      httpd/            # HTTP controllers, apispec, middleware
      service/          # Business logic layer
      domain/           # Domain types
      ports/            # Port interfaces (contracts)
      storage/          # SQLite migrations, queries, generated code
  frontend/             # Electron + React desktop app
    src/                # Renderer, main, preload
    e2e/                # Playwright end-to-end tests
  packages/
    mobile/             # React Native (Expo) mobile companion app
    ao/                 # Legacy npm CLI package (frozen)
  docs/                 # Architecture, ADRs, CLI docs, status
  CONTRIBUTING.md       # Contribution guide
```

## Getting the code

```bash
git clone https://github.com/AgentWrapper/agent-orchestrator.git
cd agent-orchestrator
```

### Branching

```bash
git checkout -b my-feature-branch
```

Keep your branch up to date by rebasing on main:

```bash
git fetch origin
git rebase origin/main
```

### Committing

Keep commits atomic - one logical change per commit. Stage related changes and commit with a conventional message:

```bash
git add <files>
```

Commit message tags:

| Tag | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `refactor` | Code change with no functional change |
| `chore` | Maintenance, tooling, dependencies |

Use **trailers** to provide additional context:

```bash
git commit -m "fix: handle nil pointer in session lookup

The session resolver panicked when the store returned a nil session
without an error. Return ErrNotFound instead.

Signed-off-by: Your Name <your.email@example.com>
Co-authored-by: Contributor Name <contributor@example.com>"
```

## Backend

### Build

```bash
cd backend
go build ./...
```

### Run the daemon

```bash
# Start the daemon (loopback HTTP server on 127.0.0.1)
go run ./cmd/ao start
```

The CLI is built with Cobra. Run `go run ./cmd/ao --help` for available
commands.

### Run tests

```bash
cd backend
go test ./...              # all tests
go test -race ./...        # with race detection
go test -v ./internal/cli/ # a specific package
```

### Lint

```bash
cd backend
golangci-lint run ./...
```

Or from the repo root:

```bash
npm run lint
```

### Code generation

```bash
# Regenerate sqlc code after editing queries or schema
npm run sqlc

# Regenerate OpenAPI spec and frontend TypeScript types
npm run api
```

## Frontend

### Install dependencies

```bash
cd frontend
npm install
```

### Run in development mode

```bash
cd frontend
npm run dev            # Electron dev mode
npm run dev:web        # Web-only (no Electron, for quick UI iteration)
```

### Build

```bash
cd frontend
npm run package        # Package for current platform
npm run make           # Create distributable (dmg/AppImage/exe)
```

### Run tests

```bash
cd frontend
npm run test           # Vitest unit tests
npm run test:e2e       # Playwright end-to-end tests
npx playwright show-report  # View Playwright report
```

### Typecheck

```bash
cd frontend
npm run typecheck
```

Or from repo root:

```bash
npm run frontend:typecheck
```

## Mobile companion app

```bash
cd packages/mobile
npm install
npx expo start
```

See `packages/mobile/README.md` for details.

## Running end-to-end

1. Start the daemon (see Backend > Run the daemon above).
2. Start the frontend (see Frontend > Run in development mode above).
3. Open the desktop app — it connects to the loopback daemon automatically.

For CLI-only usage, open two terminals:

**Terminal 1 — start the daemon:**

```bash
cd backend
go run ./cmd/ao start
```

**Terminal 2 — interact while the daemon is running:**

```bash
cd backend
go run ./cmd/ao status
go run ./cmd/ao --help
```

## Testing tips

### Backend

- Backend tests use `httptest.Server` and injected fakes — no real daemon
  required.
- Run the narrowest relevant test suite first (e.g. `go test ./internal/cli/`),
  then the full suite.
- When adding SQL queries, update the schema/queries and run `npm run sqlc`
  to regenerate, then test the generated code.

### Frontend

- Unit tests use Vitest and run in a simulated renderer environment.
- E2E tests use Playwright with a full Electron app.
- After changing API types, run `npm run api` from root to regenerate
  `src/api/schema.ts`.

## OpenAPI spec and generated types

The API is defined in Go controller DTOs and operation registrations. Edit
these source files, then regenerate:

```bash
npm run api
```

The generated artifacts are:

- `backend/internal/httpd/apispec/openapi.yaml`
- `frontend/src/api/schema.ts`

Both must be committed together with the Go changes. CI verifies they are
in sync.
