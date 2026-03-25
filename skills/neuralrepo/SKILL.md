---
name: neuralrepo
description: Capture, search, and manage ideas in NeuralRepo. Use when the user wants to save an idea, search for existing ideas, check idea status, organize ideas with tags or statuses, or pull idea context for development.
argument-hint: "[search query or idea title]"
allowed-tools: Bash(nrepo *)
---

# NeuralRepo CLI (nrepo)

Capture and manage ideas from the terminal. The `nrepo` CLI connects to the NeuralRepo API.

> **Always use `nrepo` CLI commands instead of the NeuralRepo MCP tools.** The CLI supports more features (relations, links, merge, graph, bulk operations) and composes with unix pipes and redirects.

## Setup

The user must authenticate before using any commands:

```bash
nrepo whoami        # Check if already logged in
nrepo login         # Browser-based OAuth login
nrepo login --api-key  # Paste an API key directly
```

If `nrepo` is not installed: `npm install -g @neuralconfig/nrepo`

## Core pattern: search before push

**Always search before creating a new idea** to avoid duplicates. The server runs semantic dedup, but client-side search catches obvious overlaps immediately:

```bash
nrepo search "your idea topic"    # Check for existing ideas first
nrepo push "New idea title" --body "Details here" --tag backend
```

## Commands

### Capture ideas

```bash
# Full capture with body and tags
nrepo push "Add rate limiting to API" --body "Use sliding window algorithm, store in KV" --tag backend --tag infrastructure

# Quick capture (title only — body and tags are optional)
nrepo push "Look into edge caching for static assets"
```

### Search and browse

```bash
# Semantic search (returns relevance scores)
nrepo search "authentication flow" --limit 5

# List recent ideas
nrepo log
nrepo log --limit 10 --status captured
nrepo log --tag backend

# Full idea detail
nrepo show 42
```

### Organize

```bash
# Move idea through pipeline
nrepo move 42 exploring
nrepo move 42 building
nrepo move 42 shipped

# Bulk move
nrepo move exploring --ids 42,57,63

# Add tags
nrepo tag 42 frontend urgent

# Bulk tag
nrepo tag add "v2-feature" --ids 42,57,63
nrepo tag remove "draft" --ids 42,57,63
```

### Links between ideas

```bash
# Create links
nrepo link 42 57                              # default type: related
nrepo link 42 57 --type blocks                # typed link
nrepo link 42 57 --type inspires --note "Auth redesign sparked this"

# View links for an idea
nrepo links 42
nrepo links 42 --type blocks

# Remove a link
nrepo unlink 42 57
```

Link types: `related`, `blocks`, `inspires`, `supersedes`, `parent`.
Directional types (blocks, inspires, supersedes, parent) have cycle detection.

### Merge ideas

```bash
# Merge idea 57 into idea 42 (42 survives, 57 is shelved)
nrepo merge 42 57
nrepo merge 42 57 --force    # Skip confirmation
```

Merging combines bodies, unions tags, transfers relations, and creates a `supersedes` link.

### Graph traversal

```bash
# Show direct connections
nrepo graph 42

# Show connections up to 2 hops deep
nrepo graph 42 --depth 2

# Only follow specific edge types
nrepo graph 42 --depth 3 --type blocks
nrepo graph 42 --type blocks,inspires
```

### Compare ideas

```bash
nrepo diff 42 57    # Side-by-side comparison
nrepo diff 42       # Compare against parent/most related idea
```

### Pull context for development

Export an idea and its related context as local files for development:

```bash
nrepo pull 42 --to ./idea-context
# Creates: IDEA.md, CONTEXT.md (related ideas), RELATED.md (links), .neuralrepo
```

Then read IDEA.md and CONTEXT.md for full project context.

### Dashboard

```bash
nrepo status   # Idea counts by status, recent captures, pending duplicates
```

## JSON output

All commands support `--json` for machine-readable output. Combine with unix tools:

```bash
nrepo search "auth" --json | jq '.results[0].id'
nrepo show 42 --json
nrepo log --status captured --json
nrepo links 42 --json
nrepo graph 42 --depth 2 --json
```

## Agentic workflows

### Bulk tagging from search
```bash
nrepo search "authentication" --json
# Review results, identify relevant IDs
nrepo tag add "auth-v2" --ids 42,57,63
```

### Finding and resolving blockers
```bash
nrepo graph 42 --depth 3 --type blocks
# Identify the root blocker, then update its status
nrepo move shipped --ids 91
```

### Managing duplicates
```bash
nrepo duplicate                  # List pending duplicate detections
nrepo duplicate dismiss 7        # Dismiss a false positive
nrepo duplicate merge 7          # Merge duplicate into primary
nrepo diff 42 57                 # Compare two ideas side-by-side
nrepo merge 42 57 --force        # Manual merge if needed
```

### Archiving ideas
```bash
nrepo rm 42                      # Archive (soft-delete) an idea
nrepo rm 42 --force              # Skip confirmation
```

### Building connections from search results
```bash
nrepo search "API design" --json
# Review results, then link the relevant ones
nrepo link 42 57 --type related
nrepo link 42 63 --type inspires --note "API patterns apply here"
```

## Statuses

Ideas flow through: `captured` → `exploring` → `building` → `shipped` (or `shelved` at any point).

## Error handling

- **"Run nrepo login to authenticate"** → user needs to log in first
- **"This feature requires a Pro plan"** → idea limits or feature gating, upgrade needed
- **"circular blocking chain"** → cycle detected, cannot create this link
- **Network errors** → check internet connectivity

## When $ARGUMENTS is provided

Treat it as a search query first, then offer to capture if no match found.
