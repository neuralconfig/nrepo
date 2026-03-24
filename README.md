# @neuralconfig/nrepo

CLI for [NeuralRepo](https://neuralrepo.com) — AI-native idea capture and management.

Capture ideas, search semantically, organize with tags and statuses, link related ideas, and pull context for development — all from the terminal. Designed to compose with unix pipes and tools like `jq`.

## Install

```bash
npm install -g @neuralconfig/nrepo
```

This installs two things:

1. **The `nrepo` binary** on your PATH
2. **A Claude Code skill** at `~/.claude/skills/neuralrepo/SKILL.md` (if Claude Code is installed)

The skill teaches Claude Code how to use `nrepo` commands on your behalf — capturing ideas, searching, organizing, and pulling context for development. Claude Code prefers `nrepo` over MCP tools because the CLI supports more features and composes with unix commands.

Or use without installing:

```bash
npx @neuralconfig/nrepo search "my topic"
```

### Uninstall

```bash
npm uninstall -g @neuralconfig/nrepo
```

**Note:** npm does not always run the pre-uninstall script for global packages. If the Claude Code skill persists after uninstall, remove it manually:

```bash
rm -rf ~/.claude/skills/neuralrepo
```

## Authentication

### Browser login (default)

```bash
nrepo login
```

Opens your browser to authenticate via GitHub OAuth. On success, an API key is automatically generated (labeled "CLI (auto-generated)") and saved to `~/.config/neuralrepo/config.json`. No manual key management needed.

Output defaults to **human-readable** format when logged in via browser.

### API key login

```bash
nrepo login --api-key
```

Prompts for an API key, which you can generate at [neuralrepo.com/settings](https://neuralrepo.com/settings). Useful for CI, scripts, or Claude Code environments.

Output defaults to **JSON** format when logged in via API key — this is intentional for machine consumption. Claude Code uses this mode so it can parse responses programmatically.

### Override output format

Any command accepts `--json` or `--human` to override the default:

```bash
nrepo search "auth" --json       # Force JSON (e.g., for piping to jq)
nrepo show 42 --human            # Force human-readable
```

### Check auth status

```bash
nrepo whoami
```

### Credentials storage

Credentials are stored at `~/.config/neuralrepo/config.json`:

```json
{
  "api_url": "https://neuralrepo.com/api/v1",
  "api_key": "nrp_...",
  "user_id": "...",
  "auth_method": "browser"
}
```

Clear with `nrepo logout`.

## Commands

### Capture ideas

Always search before creating to avoid duplicates — the server runs semantic dedup, but searching first catches obvious overlaps immediately.

```bash
# Full capture with body and tags
nrepo push "Add rate limiting to API" --body "Sliding window algorithm, store in KV" --tag backend --tag infrastructure

# Quick capture (title only)
nrepo stash "Look into edge caching for static assets"
```

**push options:** `--body <text>`, `--tag <tag>` (repeatable), `--status <status>`

### Search

```bash
# Semantic search (returns relevance scores)
nrepo search "authentication flow"
nrepo search "auth" --limit 5
```

### Browse

```bash
# List recent ideas
nrepo log
nrepo log --limit 10
nrepo log --status captured
nrepo log --tag backend

# Full detail for one idea
nrepo show 42
```

### Edit

```bash
nrepo edit 42 --title "New title"
nrepo edit 42 --body "Updated description"
nrepo edit 42 --title "New title" --body "New body"
```

### Organize by status

Ideas flow through: `captured` → `exploring` → `building` → `shipped` (or `shelved` at any point).

```bash
# Move a single idea
nrepo move 42 exploring
nrepo move 42 shipped

# Bulk move
nrepo move exploring --ids 42,57,63
```

### Tags

```bash
# Add tags to a single idea
nrepo tag 42 frontend urgent

# Bulk tag operations
nrepo tag add "v2-feature" --ids 42,57,63
nrepo tag remove "draft" --ids 42,57,63
```

### Links between ideas

Link types: `related` (default), `blocks`, `inspires`, `supersedes`, `parent`.
Directional types (blocks, inspires, supersedes, parent) have automatic cycle detection.

```bash
# Create links
nrepo link 42 57                                           # default: related
nrepo link 42 57 --type blocks                             # typed link
nrepo link 42 57 --type inspires --note "Auth redesign sparked this"

# View links
nrepo links 42
nrepo links 42 --type blocks

# Remove a link
nrepo unlink 42 57
```

### Merge ideas

Merging combines bodies, unions tags, transfers relations, and creates a `supersedes` link. The absorbed idea is shelved.

```bash
nrepo merge 42 57              # 42 survives, 57 is absorbed
nrepo merge 42 57 --force      # Skip confirmation
```

### Graph traversal

Explore the connection graph from any idea using BFS traversal.

```bash
nrepo graph 42                          # Direct connections
nrepo graph 42 --depth 2               # Up to 2 hops
nrepo graph 42 --depth 3 --type blocks  # Only follow "blocks" edges
nrepo graph 42 --type blocks,inspires   # Multiple edge types
```

### Compare ideas

```bash
nrepo diff 42 57    # Side-by-side comparison of two ideas
nrepo diff 42       # Compare against parent or most related idea
```

### Branch (fork)

```bash
nrepo branch 42                        # Fork with same title
nrepo branch 42 --title "Variant B"    # Fork with new title
nrepo branch 42 --body "Different approach"
```

### Pull context for development

Export an idea and its related context as local files:

```bash
nrepo pull 42 --to ./idea-context
# Creates:
#   IDEA.md       — full idea detail
#   CONTEXT.md    — related ideas and their details
#   RELATED.md    — links and relations
#   .neuralrepo   — metadata for nrepo to track the source
```

### Dashboard

```bash
nrepo status    # Idea counts by status, recent captures, pending duplicates
```

### API key management

```bash
nrepo keys list              # List all API keys
nrepo keys create "CI bot"   # Generate a new key (shown once)
nrepo keys revoke 7          # Revoke a key by ID
```

## JSON output and unix composition

All commands support `--json`. Combine with standard unix tools:

```bash
# Extract titles from search results
nrepo search "auth" --json | jq '.results[].title'

# Count ideas by status
nrepo log --status captured --json | jq length

# Get IDs of all exploring ideas
nrepo log --status exploring --json | jq '.[].id'

# Pipe graph output to other tools
nrepo graph 42 --depth 2 --json | jq '.nodes | length'
```

### Error format

Errors are written to stderr. In JSON mode:

```json
{"error": "message", "code": "http_404", "status": 404}
```

Error codes: `auth_required`, `http_<status>`, `network_error`, `unknown`.

## Claude Code integration

Installing `@neuralconfig/nrepo` automatically registers a [Claude Code](https://claude.ai/code) skill. The skill instructs Claude Code to:

- Use `nrepo` commands instead of MCP tools (more features, unix composable)
- Search before capturing to avoid duplicates
- Use JSON output mode for parsing results
- Leverage bulk operations, linking, merging, and graph traversal

The skill is installed to `~/.claude/skills/neuralrepo/SKILL.md` and auto-discovered by Claude Code on every session.

### Claude Code plugin

This package is also structured as a [Claude Code plugin](https://code.claude.com/docs/en/plugins). You can load it directly:

```bash
claude --plugin-dir /path/to/nrepo
```

Or install from the plugin directory (once approved).

## Requirements

- Node.js 18 or later
- A NeuralRepo account ([neuralrepo.com](https://neuralrepo.com))

## License

[MIT](LICENSE)
