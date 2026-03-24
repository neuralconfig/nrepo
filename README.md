# @neuralconfig/nrepo

CLI for [NeuralRepo](https://neuralrepo.com) — AI-native idea capture and management.

Capture ideas, search semantically, organize with tags and statuses, link related ideas, and pull context for development — all from the terminal.

## Install

```bash
npm install -g @neuralconfig/nrepo
```

Or use without installing:

```bash
npx @neuralconfig/nrepo search "my topic"
```

## Quick start

```bash
# Authenticate (opens browser)
nrepo login

# Search for existing ideas
nrepo search "rate limiting"

# Capture a new idea
nrepo push "Add rate limiting to API" --body "Sliding window, store in KV" --tag backend

# Browse recent ideas
nrepo log --limit 10

# View full detail
nrepo show 42
```

## Commands

| Command | Purpose |
|---------|---------|
| `nrepo login` | Authenticate via browser OAuth or `--api-key` |
| `nrepo logout` | Clear stored credentials |
| `nrepo whoami` | Show current user info |
| `nrepo push <title>` | Capture a new idea (`--body`, `--tag`, `--status`) |
| `nrepo stash <title>` | Quick capture (title only) |
| `nrepo search <query>` | Semantic + full-text search |
| `nrepo log` | List ideas (`--limit`, `--status`, `--tag`) |
| `nrepo show <id>` | Full idea detail |
| `nrepo edit <id>` | Update title or body |
| `nrepo move <id> <status>` | Change status (`--ids` for bulk) |
| `nrepo tag <id> <tags...>` | Add tags to an idea |
| `nrepo tag add <tag> --ids` | Bulk add tag |
| `nrepo tag remove <tag> --ids` | Bulk remove tag |
| `nrepo link <src> <tgt>` | Link ideas (`--type`, `--note`) |
| `nrepo unlink <src> <tgt>` | Remove a link |
| `nrepo links <id>` | Show links for an idea |
| `nrepo merge <keep> <absorb>` | Merge two ideas |
| `nrepo diff <id> [id2]` | Compare ideas side-by-side |
| `nrepo branch <id>` | Fork an idea into a variant |
| `nrepo graph <id>` | Explore connection graph (`--depth`, `--type`) |
| `nrepo pull <id>` | Export idea + context as local files |
| `nrepo status` | Dashboard with counts and recent captures |
| `nrepo keys list\|create\|revoke` | Manage API keys |

## JSON output

All commands support `--json` for machine-readable output:

```bash
nrepo search "auth" --json | jq '.results[].title'
nrepo log --status captured --json | jq length
```

## Claude Code integration

Installing `@neuralconfig/nrepo` automatically registers a [Claude Code](https://claude.ai/code) skill. Claude Code will use `nrepo` commands to capture, search, and organize ideas on your behalf.

## Statuses

`captured` → `exploring` → `building` → `shipped` (or `shelved` at any point)

## Link types

`related`, `blocks`, `inspires`, `supersedes`, `parent`

## License

[MIT](LICENSE)
