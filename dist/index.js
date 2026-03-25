#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import chalk21 from "chalk";

// src/config.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var CONFIG_DIR = join(homedir(), ".config", "neuralrepo");
var CONFIG_FILE = join(CONFIG_DIR, "config.json");
var DEFAULT_API_URL = "https://neuralrepo.com/api/v1";
async function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
async function clearConfig() {
  if (existsSync(CONFIG_FILE)) {
    await writeFile(CONFIG_FILE, "{}", "utf-8");
  }
}
async function getAuthenticatedConfig() {
  const config = await loadConfig();
  if (!config?.api_key) {
    throw new AuthError("Not logged in. Run `nrepo login` to authenticate.");
  }
  return { ...config, api_url: config.api_url || DEFAULT_API_URL };
}
var AuthError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
};

// src/api.ts
var ApiError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "ApiError";
  }
};
async function request(config, method, path, body) {
  const url = `${config.api_url}${path}`;
  const headers = {
    "X-API-Key": config.api_key,
    "Content-Type": "application/json"
  };
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
  } catch (err) {
    throw new Error(
      `Network error: ${err.message}. Check your internet connection and try again.`
    );
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(
      json.error ?? `HTTP ${res.status}`,
      res.status,
      json
    );
  }
  return res.json();
}
var getMe = (c) => request(c, "GET", "/user/me");
var listIdeas = (c, params) => {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.tag) sp.set("tag", params.tag);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return request(c, "GET", `/ideas${qs ? `?${qs}` : ""}`);
};
var createIdea = (c, data) => request(c, "POST", "/ideas", data);
var getIdea = (c, id) => request(c, "GET", `/ideas/${id}`);
var updateIdea = (c, id, data) => request(c, "PATCH", `/ideas/${id}`, data);
var searchIdeas = (c, query, limit) => {
  const sp = new URLSearchParams({ q: query });
  if (limit) sp.set("limit", String(limit));
  return request(c, "GET", `/ideas/search?${sp.toString()}`);
};
var listDuplicates = (c) => request(c, "GET", "/ideas/duplicates");
var listApiKeys = (c) => request(c, "GET", "/user/api-keys");
var createApiKey = (c, label) => request(c, "POST", "/user/api-keys", { label });
var deleteApiKey = (c, keyId) => request(c, "DELETE", `/user/api-keys/${keyId}`);
var getIdeaRelations = (c, id) => request(c, "GET", `/ideas/${id}/relations`);
var createRelation = (c, sourceId, targetId, relationType = "related", note, force) => {
  const qs = force ? "?force=true" : "";
  return request(c, "POST", `/map/relations${qs}`, {
    source_idea_id: sourceId,
    target_idea_id: targetId,
    relation_type: relationType,
    ...note ? { note } : {}
  });
};
var deleteRelation = (c, relationId) => request(c, "DELETE", `/map/relations/${relationId}`);
var deleteIdea = (c, id) => request(c, "DELETE", `/ideas/${id}`);
var dismissDuplicate = (c, dupId) => request(c, "POST", `/ideas/duplicates/${dupId}/dismiss`);
var mergeDuplicate = (c, dupId) => request(c, "POST", `/ideas/duplicates/${dupId}/merge`);
var mergeIdeas = (c, keepId, absorbId) => request(c, "POST", `/ideas/${keepId}/merge`, { absorb_id: absorbId });

// src/commands/login.ts
import { createServer } from "http";
import { randomInt } from "crypto";
import { createInterface } from "readline/promises";
import chalk from "chalk";
import ora from "ora";
async function loginCommand(opts) {
  if (opts.apiKey) {
    await loginWithApiKey();
  } else {
    await loginWithBrowser();
  }
}
async function loginWithApiKey() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = await rl.question(chalk.bold("Enter your API key: "));
  rl.close();
  if (!key.trim()) {
    console.error(chalk.red("No API key provided."));
    process.exit(1);
  }
  const spinner = ora("Verifying API key...").start();
  const config = { api_url: DEFAULT_API_URL, api_key: key.trim() };
  try {
    const user = await getMe(config);
    await saveConfig({ ...config, user_id: user.id, auth_method: "api-key" });
    spinner.succeed(`Logged in as ${chalk.bold(user.display_name ?? user.email)} (${user.plan})`);
    console.log(chalk.dim("Output defaults to JSON. Use --human for human-readable output."));
  } catch {
    spinner.fail("Invalid API key. Generate one at https://neuralrepo.com/settings");
    process.exit(1);
  }
}
async function loginWithBrowser() {
  const port = randomInt(49152, 65535);
  const callbackUrl = `http://localhost:${port}/callback`;
  console.log(chalk.dim("Starting local auth server..."));
  const keyPromise = new Promise((resolve2, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 120 seconds"));
    }, 12e4);
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname === "/callback") {
        const apiKey = url.searchParams.get("api_key");
        if (apiKey) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; text-align: center; padding: 60px; background: #0b0b0f; color: #fff;">
              <h1>\u2713 Authenticated</h1>
              <p>You can close this window and return to the terminal.</p>
            </body></html>
          `);
          clearTimeout(timeout);
          server.close();
          resolve2(apiKey);
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Error: No API key received</h1></body></html>");
          clearTimeout(timeout);
          server.close();
          reject(new Error("No API key received in callback"));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, () => {
      const authUrl = `${DEFAULT_API_URL.replace("/api/v1", "")}/auth/cli?callback=${encodeURIComponent(callbackUrl)}`;
      console.log(`
Open this URL to log in:

  ${chalk.underline(authUrl)}
`);
      console.log(chalk.dim("Waiting for authentication..."));
      const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      import("child_process").then(({ exec }) => {
        exec(`${open} "${authUrl}"`, () => {
        });
      });
    });
  });
  const spinner = ora("Waiting for browser login...").start();
  try {
    const apiKey = await keyPromise;
    const config = { api_url: DEFAULT_API_URL, api_key: apiKey };
    const user = await getMe(config);
    await saveConfig({ ...config, user_id: user.id, auth_method: "browser" });
    spinner.succeed(`Logged in as ${chalk.bold(user.display_name ?? user.email)} (${user.plan})`);
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

// src/commands/whoami.ts
import chalk2 from "chalk";
async function whoamiCommand(opts) {
  const config = await getAuthenticatedConfig();
  const user = await getMe(config);
  if (opts.json) {
    console.log(JSON.stringify(user, null, 2));
    return;
  }
  console.log(`${chalk2.bold(user.display_name ?? user.email)}`);
  console.log(`  Email:  ${user.email}`);
  console.log(`  Plan:   ${user.plan}`);
  console.log(`  ID:     ${chalk2.dim(user.id)}`);
}

// src/commands/push.ts
import chalk4 from "chalk";
import ora2 from "ora";

// src/format.ts
import chalk3 from "chalk";

// ../packages/shared/src/index.ts
import { z } from "zod";
var IDEA_STATUSES = ["captured", "exploring", "building", "shipped", "shelved"];
var IDEA_SOURCES = ["web", "cli", "claude-mcp", "siri", "email", "api", "shortcut"];
var LINK_TYPES = ["url", "claude-chat", "github-repo", "github-issue", "attachment"];
var RELATION_TYPES = ["related", "parent", "blocks", "inspires", "duplicate", "supersedes"];
var SOURCE_ICONS = {
  "claude-mcp": "\u25C8",
  siri: "\u25C9",
  web: "\u25CE",
  cli: "\u2B21",
  email: "\u2709",
  api: "\u2699",
  shortcut: "\u2318"
};
var LIMITS = {
  /** Max characters for idea title */
  IDEA_TITLE_MAX: 200,
  /** Max characters for idea body */
  IDEA_BODY_MAX: 5e4,
  /** Max tags per idea */
  IDEA_TAGS_MAX: 20,
  /** Max characters per tag name */
  TAG_NAME_MAX: 50,
  /** Max characters for a source URL */
  SOURCE_URL_MAX: 2e3,
  /** Max characters for display name */
  DISPLAY_NAME_MAX: 100,
  /** Max characters for API key label */
  API_KEY_LABEL_MAX: 100,
  /** Max characters for settings JSON blob */
  SETTINGS_JSON_MAX: 1e4,
  /** Max characters for search query */
  SEARCH_QUERY_MAX: 500,
  /** Max items per list request */
  LIST_LIMIT_MAX: 100,
  /** Default items per list request */
  LIST_LIMIT_DEFAULT: 20
};
var UserSettingsSchema = z.object({
  preferred_ai_provider: z.string().optional(),
  search_threshold: z.number().min(0.1).max(0.9).optional(),
  dedup_threshold: z.number().min(0.1).max(0.9).optional(),
  related_threshold: z.number().min(0.1).max(0.9).optional()
});
var CreateIdeaSchema = z.object({
  title: z.string().min(1).max(LIMITS.IDEA_TITLE_MAX),
  body: z.string().max(LIMITS.IDEA_BODY_MAX).optional(),
  tags: z.array(z.string().min(1).max(LIMITS.TAG_NAME_MAX)).max(LIMITS.IDEA_TAGS_MAX).optional(),
  source: z.enum(IDEA_SOURCES).optional(),
  source_url: z.string().url().max(LIMITS.SOURCE_URL_MAX).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  parent_id: z.number().int().positive().optional()
});
var UpdateIdeaSchema = z.object({
  title: z.string().min(1).max(LIMITS.IDEA_TITLE_MAX).optional(),
  body: z.string().max(LIMITS.IDEA_BODY_MAX).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().min(1).max(LIMITS.TAG_NAME_MAX)).max(LIMITS.IDEA_TAGS_MAX).optional()
});
var CreateTagSchema = z.object({
  name: z.string().min(1).max(LIMITS.TAG_NAME_MAX),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});
var UpdateTagSchema = z.object({
  name: z.string().min(1).max(LIMITS.TAG_NAME_MAX).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});
var UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(LIMITS.DISPLAY_NAME_MAX).optional(),
  settings_json: z.string().max(LIMITS.SETTINGS_JSON_MAX).optional()
});
var CreateApiKeySchema = z.object({
  label: z.string().min(1).max(LIMITS.API_KEY_LABEL_MAX).optional().default("default")
});
var CreateRelationSchema = z.object({
  source_idea_id: z.number().int().positive(),
  target_idea_id: z.number().int().positive(),
  relation_type: z.enum(RELATION_TYPES).default("related"),
  note: z.string().max(500).optional()
});
var UpdateRelationSchema = z.object({
  relation_type: z.enum(RELATION_TYPES).optional(),
  note: z.string().max(500).nullable().optional()
});
var MergeIdeasSchema = z.object({
  absorb_id: z.number().int().positive()
});
var CreateUrlLinkSchema = z.object({
  url: z.string().url().max(LIMITS.SOURCE_URL_MAX),
  title: z.string().max(LIMITS.IDEA_TITLE_MAX).optional(),
  link_type: z.enum(LINK_TYPES).default("url")
});

// src/format.ts
var statusStyle = {
  captured: chalk3.gray,
  exploring: chalk3.cyan,
  building: chalk3.yellow,
  shipped: chalk3.green,
  shelved: chalk3.dim
};
function formatIdeaRow(idea) {
  const style = statusStyle[idea.status] ?? chalk3.white;
  const icon = SOURCE_ICONS[idea.source] ?? "\xB7";
  const tags = idea.tags.length ? chalk3.dim(` [${idea.tags.join(", ")}]`) : "";
  const score = idea.score != null ? chalk3.dim(` (${(idea.score * 100).toFixed(0)}%)`) : "";
  const id = chalk3.dim(`#${idea.id}`);
  const status = style(idea.status.padEnd(10));
  return `${id} ${status} ${icon} ${idea.title}${tags}${score}`;
}
function formatIdeaDetail(idea) {
  const lines = [];
  const style = statusStyle[idea.status] ?? chalk3.white;
  const icon = SOURCE_ICONS[idea.source] ?? "\xB7";
  lines.push(chalk3.bold(`#${idea.id}  ${idea.title}`));
  lines.push("");
  lines.push(`  Status:   ${style(idea.status)}`);
  lines.push(`  Source:   ${icon} ${idea.source}`);
  lines.push(`  Created:  ${formatDate(idea.created_at)}`);
  lines.push(`  Updated:  ${formatDate(idea.updated_at)}`);
  if (idea.tags.length) {
    lines.push(`  Tags:     ${idea.tags.map((t) => chalk3.cyan(t)).join(", ")}`);
  }
  if (idea.source_url) {
    lines.push(`  URL:      ${chalk3.underline(idea.source_url)}`);
  }
  if (idea.body) {
    lines.push("");
    lines.push(chalk3.dim("  \u2500".repeat(30)));
    lines.push("");
    for (const line of idea.body.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  if (idea.links?.length) {
    lines.push("");
    lines.push(chalk3.bold("  Links"));
    for (const link of idea.links) {
      const label = link.title ?? link.link_type;
      lines.push(`    ${chalk3.dim("\xB7")} ${label}: ${chalk3.underline(link.url)}`);
    }
  }
  if (idea.relations?.length) {
    lines.push("");
    lines.push(chalk3.bold("  Related Ideas"));
    for (const rel of idea.relations) {
      const relScore = rel.score != null ? chalk3.dim(` (${(rel.score * 100).toFixed(0)}%)`) : "";
      const title = rel.related_idea_title ?? `#${rel.target_idea_id}`;
      lines.push(`    ${chalk3.dim("\xB7")} ${rel.relation_type}: ${title}${relScore}`);
    }
  }
  return lines.join("\n");
}
function formatDuplicate(dup2) {
  const score = chalk3.yellow(`${(dup2.similarity_score * 100).toFixed(0)}%`);
  return `  ${chalk3.dim(`#${dup2.id}`)} ${dup2.idea_title} ${chalk3.dim("\u2248")} ${dup2.duplicate_title} ${score}`;
}
function formatDate(iso) {
  const normalized = iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatStatusCounts(ideas) {
  const counts = {
    captured: 0,
    exploring: 0,
    building: 0,
    shipped: 0,
    shelved: 0
  };
  for (const idea of ideas) {
    counts[idea.status] = (counts[idea.status] ?? 0) + 1;
  }
  return counts;
}

// src/commands/push.ts
async function pushCommand(title, opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora2("Creating idea...").start();
  const idea = await createIdea(config, {
    title,
    body: opts.body,
    tags: opts.tag,
    source: "cli",
    status: opts.status
  });
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }
  console.log(chalk4.green("\u2713") + " Idea captured");
  console.log(formatIdeaRow(idea));
  if (idea.processing) {
    console.log(chalk4.dim("\n  Processing: embeddings, dedup, and auto-tagging queued"));
  }
}

// src/commands/search.ts
import chalk5 from "chalk";
import ora3 from "ora";
async function searchCommand(query, opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora3("Searching...").start();
  const limit = opts.limit ? parseInt(opts.limit, 10) : void 0;
  const data = await searchIdeas(config, query, limit);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(chalk5.dim(`Search: "${query}" (${data.search_type}) \u2014 ${data.results.length} results
`));
  if (data.results.length === 0) {
    console.log(chalk5.dim("  No results found."));
    return;
  }
  for (const idea of data.results) {
    console.log(formatIdeaRow(idea));
  }
}

// src/commands/log.ts
import chalk6 from "chalk";
import ora4 from "ora";
async function logCommand(opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora4("Loading ideas...").start();
  const data = await listIdeas(config, {
    limit: opts.limit ? parseInt(opts.limit, 10) : 20,
    status: opts.status,
    tag: opts.tag
  });
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(data.ideas, null, 2));
    return;
  }
  if (data.ideas.length === 0) {
    console.log(chalk6.dim("No ideas found."));
    return;
  }
  for (const idea of data.ideas) {
    console.log(formatIdeaRow(idea));
  }
}

// src/commands/status.ts
import chalk7 from "chalk";
import ora5 from "ora";
var statusStyle2 = {
  captured: chalk7.gray,
  exploring: chalk7.cyan,
  building: chalk7.yellow,
  shipped: chalk7.green,
  shelved: chalk7.dim
};
async function statusCommand(opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora5("Loading dashboard...").start();
  const [ideasData, dupsData, user] = await Promise.all([
    listIdeas(config, { limit: 100 }),
    listDuplicates(config),
    getMe(config)
  ]);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({
      user: { email: user.email, plan: user.plan },
      counts: formatStatusCounts(ideasData.ideas),
      total: ideasData.ideas.length,
      pending_duplicates: dupsData.duplicates.length
    }, null, 2));
    return;
  }
  console.log(chalk7.bold("NeuralRepo Dashboard"));
  console.log(chalk7.dim(`${user.display_name ?? user.email} \xB7 ${user.plan}
`));
  const counts = formatStatusCounts(ideasData.ideas);
  console.log(chalk7.bold("Status breakdown"));
  for (const [status, count] of Object.entries(counts)) {
    const style = statusStyle2[status] ?? chalk7.white;
    const bar = "\u2588".repeat(Math.min(count, 40));
    console.log(`  ${style(status.padEnd(10))} ${style(bar)} ${count}`);
  }
  console.log(`  ${"total".padEnd(10)} ${chalk7.bold(String(ideasData.ideas.length))}
`);
  const recent = ideasData.ideas.filter((i) => i.status === "captured").slice(0, 5);
  if (recent.length > 0) {
    console.log(chalk7.bold("Recent captures"));
    for (const idea of recent) {
      console.log(`  ${formatIdeaRow(idea)}`);
    }
    console.log("");
  }
  const pendingDups = dupsData.duplicates.filter((d) => d.status === "pending");
  if (pendingDups.length > 0) {
    console.log(chalk7.bold(`Pending duplicates (${pendingDups.length})`));
    for (const dup2 of pendingDups.slice(0, 5)) {
      console.log(formatDuplicate(dup2));
    }
  }
}

// src/commands/show.ts
import ora6 from "ora";
async function showCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora6("Loading idea...").start();
  const idea = await getIdea(config, ideaId);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }
  console.log(formatIdeaDetail(idea));
}

// src/commands/move.ts
import chalk8 from "chalk";
import ora7 from "ora";
async function moveCommand(id, status, opts) {
  if (!IDEA_STATUSES.includes(status)) {
    console.error(`Invalid status "${status}". Must be one of: ${IDEA_STATUSES.join(", ")}`);
    process.exit(1);
  }
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora7("Updating status...").start();
  const idea = await updateIdea(config, ideaId, { status });
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }
  console.log(chalk8.green("\u2713") + ` #${idea.id} \u2192 ${status}`);
}
async function moveBulkCommand(status, opts) {
  if (!IDEA_STATUSES.includes(status)) {
    console.error(`Invalid status "${status}". Must be one of: ${IDEA_STATUSES.join(", ")}`);
    process.exit(1);
  }
  const config = await getAuthenticatedConfig();
  const ids = opts.ids.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  if (ids.length === 0) {
    console.error("Provide at least one ID with --ids");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora7(`Moving ${ids.length} ideas to ${status}...`).start();
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const idea = await updateIdea(config, id, { status });
      return { id, title: idea.title };
    })
  );
  spinner?.stop();
  if (opts.json) {
    const output = results.map((r, i) => ({
      id: ids[i],
      success: r.status === "fulfilled",
      error: r.status === "rejected" ? r.reason.message : void 0
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Moved ${ids.length} ideas to ${status}:`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`  ${chalk8.green("\u2713")} #${ids[i]}  ${r.value.title}`);
    } else {
      console.log(`  ${chalk8.red("\u2717")} #${ids[i]}  ${r.reason.message}`);
    }
  });
}

// src/commands/tag.ts
import chalk9 from "chalk";
import ora8 from "ora";
async function tagCommand(id, tags, opts) {
  if (tags.length === 0) {
    console.error("Provide at least one tag");
    process.exit(1);
  }
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora8("Updating tags...").start();
  const existing = await getIdea(config, ideaId);
  const merged = [.../* @__PURE__ */ new Set([...existing.tags, ...tags])];
  const idea = await updateIdea(config, ideaId, { tags: merged });
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }
  console.log(chalk9.green("\u2713") + ` #${idea.id} tags: ${idea.tags.join(", ")}`);
}
async function tagAddCommand(tag, opts) {
  const config = await getAuthenticatedConfig();
  const ids = parseIds(opts.ids);
  if (ids.length === 0) {
    console.error("Provide at least one ID with --ids");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora8(`Adding tag "${tag}" to ${ids.length} ideas...`).start();
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const existing = await getIdea(config, id);
      const merged = [.../* @__PURE__ */ new Set([...existing.tags, tag])];
      await updateIdea(config, id, { tags: merged });
      return { id, title: existing.title };
    })
  );
  spinner?.stop();
  if (opts.json) {
    const output = results.map((r, i) => ({
      id: ids[i],
      success: r.status === "fulfilled",
      error: r.status === "rejected" ? r.reason.message : void 0
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Tagged ${ids.length} ideas with "${tag}":`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`  ${chalk9.green("\u2713")} #${ids[i]}  ${r.value.title}`);
    } else {
      console.log(`  ${chalk9.red("\u2717")} #${ids[i]}  ${r.reason.message}`);
    }
  });
}
async function tagRemoveCommand(tag, opts) {
  const config = await getAuthenticatedConfig();
  const ids = parseIds(opts.ids);
  if (ids.length === 0) {
    console.error("Provide at least one ID with --ids");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora8(`Removing tag "${tag}" from ${ids.length} ideas...`).start();
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const existing = await getIdea(config, id);
      const filtered = existing.tags.filter((t) => t !== tag);
      await updateIdea(config, id, { tags: filtered });
      return { id, title: existing.title };
    })
  );
  spinner?.stop();
  if (opts.json) {
    const output = results.map((r, i) => ({
      id: ids[i],
      success: r.status === "fulfilled",
      error: r.status === "rejected" ? r.reason.message : void 0
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Removed tag "${tag}" from ${ids.length} ideas:`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`  ${chalk9.green("\u2713")} #${ids[i]}  ${r.value.title}`);
    } else {
      console.log(`  ${chalk9.red("\u2717")} #${ids[i]}  ${r.reason.message}`);
    }
  });
}
function parseIds(idsStr) {
  return idsStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
}

// src/commands/pull.ts
import { writeFile as writeFile2, mkdir as mkdir2 } from "fs/promises";
import { join as join2, resolve } from "path";
import chalk10 from "chalk";
import ora9 from "ora";
async function pullCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora9("Pulling idea context...").start();
  const idea = await getIdea(config, ideaId);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }
  const dir = resolve(opts.to ?? ".");
  await mkdir2(dir, { recursive: true });
  const ideaMd = [
    `# ${idea.title}`,
    "",
    `**Status:** ${idea.status}`,
    `**Source:** ${idea.source}`,
    `**Created:** ${idea.created_at}`,
    idea.tags.length ? `**Tags:** ${idea.tags.join(", ")}` : "",
    idea.source_url ? `**URL:** ${idea.source_url}` : "",
    "",
    "---",
    "",
    idea.body ?? "_No body_"
  ].filter(Boolean).join("\n");
  await writeFile2(join2(dir, "IDEA.md"), ideaMd + "\n", "utf-8");
  const relations = idea.relations ?? [];
  if (relations.length > 0) {
    const contextLines = [
      "# Related Ideas",
      "",
      ...relations.map((r) => {
        const score = r.score != null ? ` (${(r.score * 100).toFixed(0)}%)` : "";
        const title = r.related_idea_title ?? `#${r.target_idea_id}`;
        return `- **${r.relation_type}**: ${title}${score}`;
      })
    ];
    await writeFile2(join2(dir, "CONTEXT.md"), contextLines.join("\n") + "\n", "utf-8");
  }
  const links = idea.links ?? [];
  if (links.length > 0) {
    const linkLines = [
      "# Links",
      "",
      ...links.map((l) => `- [${l.title ?? l.link_type}](${l.url})`)
    ];
    await writeFile2(join2(dir, "RELATED.md"), linkLines.join("\n") + "\n", "utf-8");
  }
  const syncConfig = {
    idea_id: idea.id,
    api_url: config.api_url,
    pulled_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeFile2(join2(dir, ".neuralrepo"), JSON.stringify(syncConfig, null, 2) + "\n", "utf-8");
  console.log(chalk10.green("\u2713") + ` Pulled #${idea.id} to ${dir}/`);
  console.log(chalk10.dim(`  IDEA.md${relations.length ? ", CONTEXT.md" : ""}${links.length ? ", RELATED.md" : ""}, .neuralrepo`));
}

// src/commands/diff.ts
import chalk11 from "chalk";
import ora10 from "ora";
async function diffCommand(id1, id2OrOpts, opts) {
  const config = await getAuthenticatedConfig();
  const firstId = parseInt(id1, 10);
  if (isNaN(firstId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  let secondId;
  let resolvedOpts;
  if (typeof id2OrOpts === "string") {
    secondId = parseInt(id2OrOpts, 10);
    if (isNaN(secondId)) {
      console.error("Invalid second idea ID");
      process.exit(1);
    }
    resolvedOpts = opts ?? {};
  } else if (id2OrOpts && typeof id2OrOpts === "object") {
    resolvedOpts = id2OrOpts;
  } else {
    resolvedOpts = opts ?? {};
  }
  const jsonOutput = resolvedOpts.json ?? false;
  const spinner = jsonOutput ? null : ora10("Loading ideas...").start();
  const ideaA = await getIdea(config, firstId);
  if (secondId == null) {
    secondId = findComparisonTarget(ideaA);
    if (secondId == null) {
      spinner?.stop();
      if (jsonOutput) {
        console.error(JSON.stringify({ error: `No parent or related idea to diff against. Usage: nrepo diff ${firstId} <other-id>`, code: "no_diff_target" }));
        process.exit(1);
      }
      console.log(chalk11.dim("No parent or related idea to diff against."));
      console.log(chalk11.dim(`Usage: nrepo diff ${firstId} <other-id>`));
      return;
    }
  }
  const ideaB = await getIdea(config, secondId);
  spinner?.stop();
  if (jsonOutput) {
    console.log(JSON.stringify({ a: ideaA, b: ideaB, diff: computeDiff(ideaA, ideaB) }, null, 2));
    return;
  }
  printDiff(ideaA, ideaB);
}
function findComparisonTarget(idea) {
  if (idea.parent_id) return idea.parent_id;
  if (!idea.relations?.length) return void 0;
  const parent = idea.relations.find((r) => r.relation_type === "parent");
  if (parent) return parent.target_idea_id;
  const duplicate = idea.relations.find((r) => r.relation_type === "duplicate");
  if (duplicate) return duplicate.target_idea_id;
  const sorted = [...idea.relations].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return sorted[0]?.target_idea_id;
}
function computeDiff(a, b) {
  const fields = [
    { field: "Title", key: "title" },
    { field: "Body", key: "body" },
    { field: "Status", key: "status" },
    { field: "Source", key: "source" },
    { field: "Tags", key: "tags" }
  ];
  return fields.map(({ field, key }) => {
    const valA = key === "tags" ? (a.tags ?? []).join(", ") : String(a[key] ?? "");
    const valB = key === "tags" ? (b.tags ?? []).join(", ") : String(b[key] ?? "");
    return { field, a: valA, b: valB, changed: valA !== valB };
  });
}
function printDiff(a, b) {
  const diffs = computeDiff(a, b);
  const anyChanged = diffs.some((d) => d.changed);
  console.log(chalk11.bold(`diff #${a.id} \u2192 #${b.id}`));
  console.log(chalk11.dim("\u2500".repeat(60)));
  if (!anyChanged) {
    console.log(chalk11.dim("  No differences found."));
    return;
  }
  for (const d of diffs) {
    if (!d.changed) continue;
    console.log(chalk11.bold(`
  ${d.field}`));
    if (d.field === "Body") {
      printBodyDiff(d.a, d.b);
    } else {
      console.log(chalk11.red(`  - ${d.a || "(empty)"}`));
      console.log(chalk11.green(`  + ${d.b || "(empty)"}`));
    }
  }
  console.log("");
}
function printBodyDiff(bodyA, bodyB) {
  const linesA = (bodyA || "").split("\n");
  const linesB = (bodyB || "").split("\n");
  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    const lineA = linesA[i];
    const lineB = linesB[i];
    if (lineA === lineB) {
      console.log(chalk11.dim(`    ${lineA}`));
    } else {
      if (lineA != null) console.log(chalk11.red(`  - ${lineA}`));
      if (lineB != null) console.log(chalk11.green(`  + ${lineB}`));
    }
  }
}

// src/commands/branch.ts
import chalk12 from "chalk";
import ora11 from "ora";
async function branchCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const sourceId = parseInt(id, 10);
  if (isNaN(sourceId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora11("Branching idea...").start();
  const source = await getIdea(config, sourceId);
  const forked = await createIdea(config, {
    title: opts.title ?? source.title,
    body: opts.body ?? source.body ?? void 0,
    tags: source.tags,
    source: "cli",
    status: "captured",
    parent_id: sourceId
  });
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(forked, null, 2));
    return;
  }
  console.log(chalk12.green("\u2713") + ` Branched from #${sourceId}`);
  console.log(formatIdeaRow(forked));
  if (forked.processing) {
    console.log(chalk12.dim("\n  Processing: embeddings, dedup, and auto-tagging queued"));
  }
  console.log(chalk12.dim(`
  Compare with: nrepo diff ${sourceId} ${forked.id}`));
}

// src/commands/edit.ts
import chalk13 from "chalk";
import ora12 from "ora";
async function editCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const updates = {};
  if (opts.title) updates.title = opts.title;
  if (opts.body) updates.body = opts.body;
  if (Object.keys(updates).length === 0) {
    console.error(opts.json ? JSON.stringify({ error: "Nothing to update. Use --title or --body.", code: "no_input" }) : "Nothing to update. Use --title or --body.");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora12("Updating idea...").start();
  const updated = await updateIdea(config, ideaId, updates);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(chalk13.green("\u2713") + ` Updated #${updated.id}`);
  if (opts.title) console.log(`  Title: ${chalk13.bold(updated.title)}`);
  if (opts.body) console.log(`  Body updated (${updated.body?.length ?? 0} chars)`);
}

// src/commands/key.ts
import chalk14 from "chalk";
import ora13 from "ora";
async function keysListCommand(opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora13("Loading API keys...").start();
  const { api_keys } = await listApiKeys(config);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ api_keys }, null, 2));
    return;
  }
  if (api_keys.length === 0) {
    console.log(chalk14.dim("No API keys found. Create one with `nrepo key create <label>`."));
    return;
  }
  console.log(chalk14.bold(`${api_keys.length} API key${api_keys.length === 1 ? "" : "s"}
`));
  for (const key of api_keys) {
    const lastUsed = key.last_used_at ? formatDate(key.last_used_at) : chalk14.dim("never");
    console.log(`  ${chalk14.bold(key.label || chalk14.dim("(no label)"))}  ${chalk14.dim(key.id)}`);
    console.log(`    Created: ${formatDate(key.created_at)}  Last used: ${lastUsed}
`);
  }
}
async function keysCreateCommand(label, opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora13("Creating API key...").start();
  const result = await createApiKey(config, label);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(chalk14.green("\u2713") + " API key created\n");
  console.log(`  Label:  ${chalk14.bold(result.label)}`);
  console.log(`  Key:    ${chalk14.bold(result.key)}`);
  console.log(`
${chalk14.yellow("Save this key now \u2014 it won't be shown again.")}`);
}
async function keysRevokeCommand(keyId, opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora13("Revoking API key...").start();
  await deleteApiKey(config, keyId);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ success: true, revoked: keyId }));
    return;
  }
  console.log(chalk14.green("\u2713") + ` API key ${chalk14.dim(keyId)} revoked.`);
}

// src/commands/rm.ts
import chalk15 from "chalk";
import ora14 from "ora";
async function rmCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora14("Loading idea...").start();
  const idea = await getIdea(config, ideaId);
  spinner?.stop();
  if (!opts.json && !opts.force) {
    console.log(chalk15.bold("Archive preview:"));
    console.log(`  #${ideaId} "${idea.title}" [${idea.status}]`);
    console.log("");
    console.log(chalk15.dim("  The idea will be archived (soft-deleted)."));
    console.log("");
  }
  const archiveSpinner = opts.json ? null : ora14("Archiving idea...").start();
  await deleteIdea(config, ideaId);
  archiveSpinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ success: true, archived: ideaId }));
    return;
  }
  console.log(chalk15.green("\u2713") + ` Archived #${ideaId} "${idea.title}"`);
}

// src/commands/duplicate.ts
import chalk16 from "chalk";
import ora15 from "ora";
async function duplicateListCommand(opts) {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora15("Loading duplicates...").start();
  const { duplicates } = await listDuplicates(config);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ duplicates }, null, 2));
    return;
  }
  const pending = duplicates.filter((d) => d.status === "pending");
  if (pending.length === 0) {
    console.log(chalk16.dim("No pending duplicates."));
    return;
  }
  console.log(chalk16.bold(`${pending.length} pending duplicate${pending.length === 1 ? "" : "s"}
`));
  for (const dup2 of pending) {
    console.log(formatDuplicate(dup2));
  }
  console.log("");
  console.log(chalk16.dim("  Use `nrepo duplicate dismiss <id>` or `nrepo duplicate merge <id>` to resolve."));
}
async function duplicateDismissCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const dupId = parseInt(id, 10);
  if (isNaN(dupId)) {
    console.error("Invalid duplicate ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora15("Dismissing duplicate...").start();
  await dismissDuplicate(config, dupId);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ success: true, dismissed: dupId }));
    return;
  }
  console.log(chalk16.green("\u2713") + ` Dismissed duplicate #${dupId}`);
}
async function duplicateMergeCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const dupId = parseInt(id, 10);
  if (isNaN(dupId)) {
    console.error("Invalid duplicate ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora15("Merging duplicate...").start();
  await mergeDuplicate(config, dupId);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ success: true, merged: dupId }));
    return;
  }
  console.log(chalk16.green("\u2713") + ` Merged duplicate #${dupId} into primary idea`);
}

// src/commands/link.ts
import chalk17 from "chalk";
import ora16 from "ora";
var VALID_TYPES = RELATION_TYPES.filter((t) => t !== "duplicate");
async function linkCommand(sourceId, targetId, opts) {
  const config = await getAuthenticatedConfig();
  const src = parseInt(sourceId, 10);
  const tgt = parseInt(targetId, 10);
  if (isNaN(src) || isNaN(tgt)) {
    console.error("Invalid idea IDs");
    process.exit(1);
  }
  const relationType = opts.type ?? "related";
  if (!VALID_TYPES.includes(relationType)) {
    console.error(`Invalid type "${relationType}". Must be one of: ${VALID_TYPES.join(", ")}`);
    process.exit(1);
  }
  const spinner = opts.json ? null : ora16("Creating link...").start();
  try {
    const result = await createRelation(config, src, tgt, relationType, opts.note, opts.force);
    spinner?.stop();
    if (opts.json) {
      console.log(JSON.stringify(result.relation, null, 2));
      return;
    }
    console.log(chalk17.green("\u2713") + ` Linked #${src} \u2192 #${tgt} (${relationType})`);
    if (opts.note) {
      console.log(chalk17.dim(`  Note: ${opts.note}`));
    }
  } catch (err) {
    spinner?.stop();
    if (err instanceof ApiError && err.status === 409) {
      if (opts.json) {
        console.error(JSON.stringify({ error: err.message, code: "cycle_detected" }));
      } else {
        console.error(chalk17.red(err.message));
        if (!opts.force && (relationType === "supersedes" || relationType === "parent")) {
          console.error(chalk17.dim("  Use --force to bypass this check."));
        }
      }
      process.exit(1);
    }
    throw err;
  }
}
async function unlinkCommand(sourceId, targetId, opts) {
  const config = await getAuthenticatedConfig();
  const src = parseInt(sourceId, 10);
  const tgt = parseInt(targetId, 10);
  if (isNaN(src) || isNaN(tgt)) {
    console.error("Invalid idea IDs");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora16("Removing link...").start();
  const relations = await getIdeaRelations(config, src);
  const match = relations.outgoing.find((r) => r.idea_id === tgt) ?? relations.incoming.find((r) => r.idea_id === tgt);
  if (!match) {
    spinner?.stop();
    if (opts.json) {
      console.error(JSON.stringify({ error: "No link found between these ideas" }));
    } else {
      console.error(`No link found between #${src} and #${tgt}. Run ${chalk17.cyan(`nrepo links ${src}`)} to see existing links.`);
    }
    process.exit(1);
  }
  await deleteRelation(config, match.id);
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({ success: true }));
    return;
  }
  console.log(chalk17.green("\u2713") + ` Unlinked #${src} \u2194 #${tgt}`);
}
async function linksCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora16("Loading links...").start();
  const [idea, relations] = await Promise.all([
    getIdea(config, ideaId),
    getIdeaRelations(config, ideaId)
  ]);
  spinner?.stop();
  let { outgoing, incoming } = relations;
  if (opts.type) {
    outgoing = outgoing.filter((r) => r.relation_type === opts.type);
    incoming = incoming.filter((r) => r.relation_type === opts.type);
  }
  if (opts.json) {
    console.log(JSON.stringify({ outgoing, incoming }, null, 2));
    return;
  }
  console.log(chalk17.bold(`Links for #${ideaId} "${idea.title}":`));
  if (outgoing.length === 0 && incoming.length === 0) {
    console.log(chalk17.dim("  No links"));
    return;
  }
  const DISPLAY = {
    blocks: { out: "Blocks", in: "Blocked by", arrow: "\u2192" },
    inspires: { out: "Inspires", in: "Inspired by", arrow: "\u2192" },
    supersedes: { out: "Supersedes", in: "Superseded by", arrow: "\u2192" },
    parent: { out: "Parent of", in: "Child of", arrow: "\u2192" },
    related: { out: "Related", in: "Related", arrow: "\u2194" },
    duplicate: { out: "Similar", in: "Similar", arrow: "\u2194" }
  };
  const outByType = /* @__PURE__ */ new Map();
  for (const r of outgoing) {
    const list = outByType.get(r.relation_type) ?? [];
    list.push(r);
    outByType.set(r.relation_type, list);
  }
  const inByType = /* @__PURE__ */ new Map();
  for (const r of incoming) {
    const list = inByType.get(r.relation_type) ?? [];
    list.push(r);
    inByType.set(r.relation_type, list);
  }
  for (const [type, items] of outByType) {
    const d = DISPLAY[type] ?? { out: type, arrow: "\u2192" };
    console.log("");
    console.log(`  ${chalk17.bold(d.out)} ${d.arrow}`);
    for (const r of items) {
      const status = chalk17.dim(`[${r.idea_status}]`);
      const note = r.note ? chalk17.dim(` \u2014 ${r.note}`) : "";
      console.log(`    #${r.idea_id}  ${r.idea_title} ${status}${note}`);
    }
  }
  for (const [type, items] of inByType) {
    if ((type === "related" || type === "duplicate") && outByType.has(type)) continue;
    const d = DISPLAY[type] ?? { in: type, arrow: "\u2190" };
    console.log("");
    console.log(`  ${chalk17.bold(d.in)} \u2190`);
    for (const r of items) {
      const status = chalk17.dim(`[${r.idea_status}]`);
      const note = r.note ? chalk17.dim(` \u2014 ${r.note}`) : "";
      console.log(`    #${r.idea_id}  ${r.idea_title} ${status}${note}`);
    }
  }
  console.log("");
}

// src/commands/merge.ts
import chalk18 from "chalk";
import ora17 from "ora";
async function mergeCommand(keepId, absorbId, opts) {
  const config = await getAuthenticatedConfig();
  const keep = parseInt(keepId, 10);
  const absorb = parseInt(absorbId, 10);
  if (isNaN(keep) || isNaN(absorb)) {
    console.error("Invalid idea IDs");
    process.exit(1);
  }
  if (keep === absorb) {
    console.error("Cannot merge an idea with itself");
    process.exit(1);
  }
  const spinner = opts.json ? null : ora17("Loading ideas...").start();
  const [keepIdea, absorbIdea] = await Promise.all([
    getIdea(config, keep),
    getIdea(config, absorb)
  ]);
  spinner?.stop();
  if (!opts.json && !opts.force) {
    console.log(chalk18.bold("Merge preview:"));
    console.log(`  Keep:    #${keep} "${keepIdea.title}" [${keepIdea.status}]`);
    console.log(`  Absorb:  #${absorb} "${absorbIdea.title}" [${absorbIdea.status}]`);
    console.log("");
    console.log(chalk18.dim("  The absorbed idea will be shelved and archived."));
    console.log(chalk18.dim("  Bodies will be concatenated, tags merged."));
    console.log("");
  }
  const mergeSpinner = opts.json ? null : ora17("Merging ideas...").start();
  const result = await mergeIdeas(config, keep, absorb);
  mergeSpinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(chalk18.green("\u2713") + ` Merged #${absorb} into #${keep}`);
  console.log(`  Title: "${result.title}"`);
  console.log(`  Tags: ${result.tags?.length ? result.tags.join(", ") : "none"}`);
  console.log(`  #${absorb} "${absorbIdea.title}" \u2192 shelved (superseded by #${keep})`);
}

// src/commands/graph.ts
import chalk19 from "chalk";
import ora18 from "ora";
async function graphCommand(id, opts) {
  const config = await getAuthenticatedConfig();
  const startId = parseInt(id, 10);
  if (isNaN(startId)) {
    console.error("Invalid idea ID");
    process.exit(1);
  }
  const maxDepth = Math.min(parseInt(opts.depth ?? "1", 10), 5);
  const typeFilter = opts.type?.split(",");
  const spinner = opts.json ? null : ora18("Traversing graph...").start();
  const visited = /* @__PURE__ */ new Map();
  const edges = [];
  const children = /* @__PURE__ */ new Map();
  let currentLevel = [startId];
  let depth = 0;
  const rootIdea = await getIdea(config, startId);
  visited.set(startId, { id: startId, title: rootIdea.title, status: rootIdea.status, depth: 0 });
  while (depth < maxDepth && currentLevel.length > 0) {
    const nextLevel = [];
    for (const nodeId of currentLevel) {
      const relations = await getIdeaRelations(config, nodeId);
      const allRelations = [
        ...relations.outgoing.map((r) => ({ ...r, direction: "out" })),
        ...relations.incoming.map((r) => ({ ...r, direction: "in" }))
      ];
      for (const rel of allRelations) {
        if (typeFilter && !typeFilter.includes(rel.relation_type)) continue;
        const neighborId = rel.idea_id;
        if (visited.has(neighborId)) continue;
        visited.set(neighborId, {
          id: neighborId,
          title: rel.idea_title,
          status: rel.idea_status,
          depth: depth + 1
        });
        const edgeSource = rel.direction === "out" ? nodeId : neighborId;
        const edgeTarget = rel.direction === "out" ? neighborId : nodeId;
        edges.push({ source: edgeSource, target: edgeTarget, type: rel.relation_type });
        const list = children.get(nodeId) ?? [];
        list.push({ childId: neighborId, type: rel.relation_type, title: rel.idea_title, status: rel.idea_status });
        children.set(nodeId, list);
        nextLevel.push(neighborId);
      }
    }
    currentLevel = nextLevel;
    depth++;
  }
  spinner?.stop();
  if (opts.json) {
    console.log(JSON.stringify({
      root: startId,
      depth: maxDepth,
      types: typeFilter ?? null,
      nodes: Array.from(visited.values()),
      edges
    }, null, 2));
    return;
  }
  const statusStyle3 = {
    captured: chalk19.gray,
    exploring: chalk19.cyan,
    building: chalk19.yellow,
    shipped: chalk19.green,
    shelved: chalk19.dim
  };
  const typeColor = {
    blocks: chalk19.red,
    inspires: chalk19.cyan,
    supersedes: chalk19.dim,
    parent: chalk19.white,
    related: chalk19.magenta,
    duplicate: chalk19.yellow
  };
  function renderTree(nodeId, prefix, isLast, isRoot) {
    const node = visited.get(nodeId);
    const style = statusStyle3[node.status] ?? chalk19.white;
    const connector = isRoot ? "" : isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childPrefix = isRoot ? "" : isLast ? "    " : "\u2502   ";
    const nodeChildren = children.get(nodeId) ?? [];
    if (isRoot) {
      console.log(`#${node.id} ${node.title} ${style(`[${node.status}]`)}`);
    } else {
      const parentRel = nodeChildren.length > 0 ? "" : "";
      console.log(`${prefix}${connector}#${node.id} ${node.title} ${style(`[${node.status}]`)}`);
    }
    for (const [i, child] of nodeChildren.entries()) {
      const last = i === nodeChildren.length - 1;
      const tc = typeColor[child.type] ?? chalk19.white;
      const childNode = visited.get(child.childId);
      const childStyle = statusStyle3[childNode.status] ?? chalk19.white;
      const childConnector = last ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
      const nextPrefix = prefix + childPrefix + (last ? "    " : "\u2502   ");
      console.log(
        `${prefix}${childPrefix}${childConnector}${tc(child.type)} \u2192 #${child.childId} ${child.title} ${childStyle(`[${childNode.status}]`)}`
      );
      const grandchildren = children.get(child.childId) ?? [];
      for (const [j, gc] of grandchildren.entries()) {
        const gcLast = j === grandchildren.length - 1;
        const gcNode = visited.get(gc.childId);
        if (!gcNode) continue;
        const gcStyle = statusStyle3[gcNode.status] ?? chalk19.white;
        const gcTc = typeColor[gc.type] ?? chalk19.white;
        const gcConnector = gcLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
        console.log(
          `${nextPrefix}${gcConnector}${gcTc(gc.type)} \u2192 #${gc.childId} ${gc.title} ${gcStyle(`[${gcNode.status}]`)}`
        );
      }
    }
  }
  if (visited.size === 1) {
    const root = visited.get(startId);
    const style = statusStyle3[root.status] ?? chalk19.white;
    console.log(`#${root.id} ${root.title} ${style(`[${root.status}]`)}`);
    console.log(chalk19.dim("  No connections found"));
  } else {
    renderTree(startId, "", true, true);
  }
}

// src/update-check.ts
import { readFileSync, existsSync as existsSync2 } from "fs";
import { writeFile as writeFile3, mkdir as mkdir3, copyFile } from "fs/promises";
import { homedir as homedir2 } from "os";
import { join as join3, dirname } from "path";
import { fileURLToPath } from "url";
import chalk20 from "chalk";
var CHECK_FILE = join3(CONFIG_DIR, "update-check.json");
var WEEK_MS = 7 * 24 * 60 * 60 * 1e3;
var PACKAGE_NAME = "@neuralconfig/nrepo";
function checkForUpdates(currentVersion) {
  if (process.env["NREPO_NO_UPDATE_CHECK"] === "1") return;
  try {
    const cached = readCachedCheck();
    if (cached?.latest_version && isNewer(cached.latest_version, currentVersion)) {
      printUpdateNotice(currentVersion, cached.latest_version);
    }
    if (!cached || isStale(cached.last_checked)) {
      fetchAndCache(currentVersion);
    }
  } catch {
  }
}
function printUpdateNotice(current, latest) {
  console.error(
    chalk20.dim(`  nrepo ${latest} available (current: ${current}). Run `) + chalk20.dim.bold("npm i -g @neuralconfig/nrepo") + chalk20.dim(" to update.")
  );
  console.error("");
}
function readCachedCheck() {
  if (!existsSync2(CHECK_FILE)) return null;
  try {
    const raw = readFileSync(CHECK_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function isStale(lastChecked) {
  return Date.now() - new Date(lastChecked).getTime() > WEEK_MS;
}
function isNewer(latest, current) {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}
function fetchAndCache(currentVersion) {
  (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5e3);
    try {
      const res = await fetch(
        `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      const latest = data.version;
      if (!existsSync2(CONFIG_DIR)) {
        await mkdir3(CONFIG_DIR, { recursive: true });
      }
      const check = {
        last_checked: (/* @__PURE__ */ new Date()).toISOString(),
        latest_version: latest
      };
      await writeFile3(CHECK_FILE, JSON.stringify(check, null, 2) + "\n", "utf-8");
      if (isNewer(latest, currentVersion)) {
        await updateSkillFile();
      }
    } catch {
    }
  })();
}
async function updateSkillFile() {
  try {
    const claudeDir = join3(homedir2(), ".claude");
    if (!existsSync2(claudeDir)) return;
    const skillDir = join3(claudeDir, "skills", "neuralrepo");
    if (!existsSync2(skillDir)) {
      await mkdir3(skillDir, { recursive: true });
    }
    const src = join3(dirname(fileURLToPath(import.meta.url)), "..", "skill", "SKILL.md");
    if (!existsSync2(src)) return;
    const dest = join3(skillDir, "SKILL.md");
    await copyFile(src, dest);
  } catch {
  }
}

// src/index.ts
var VERSION = "0.0.4";
var program = new Command();
program.name("nrepo").description("NeuralRepo \u2014 capture and manage ideas from the terminal").version(VERSION);
program.command("login").description("Authenticate with NeuralRepo").option("--api-key", "Login with an API key instead of browser OAuth").action(wrap(loginCommand));
program.command("logout").description("Clear stored credentials").action(wrap(async () => {
  await clearConfig();
  console.log("Logged out.");
}));
program.command("whoami").description("Show current user info").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(whoamiCommand));
program.command("push <title>").description("Create a new idea").option("--body <text>", "Idea body/description").option("--tag <tag>", "Add tag (repeatable)", collect, []).option("--status <status>", "Initial status (captured|exploring|building|shipped|shelved)").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(pushCommand));
program.command("search <query>").description("Search ideas (semantic + full-text)").option("--limit <n>", "Max results").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(searchCommand));
program.command("log").description("List recent ideas").option("--limit <n>", "Max results (default: 20)").option("--status <status>", "Filter by status").option("--tag <tag>", "Filter by tag").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(logCommand));
program.command("status").description("Overview dashboard").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(statusCommand));
program.command("show <id>").description("Show full idea detail").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(showCommand));
program.command("edit <id>").description("Update an idea's title or body").option("--title <title>", "New title").option("--body <body>", "New body").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(editCommand));
program.command("move <id-or-status> [status]").description("Change idea status (single: move <id> <status>, bulk: move <status> --ids 1,2,3)").option("--ids <ids>", "Comma-separated idea IDs for bulk move").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(async (idOrStatus, status, opts) => {
  if (opts.ids) {
    await moveBulkCommand(idOrStatus, { ids: opts.ids, json: opts.json });
  } else if (status) {
    await moveCommand(idOrStatus, status, { json: opts.json });
  } else {
    console.error("Usage: nrepo move <id> <status> or nrepo move <status> --ids 1,2,3");
    process.exit(1);
  }
}));
var tagCmd = program.command("tag").description("Manage tags (tag <id> <tags...> or tag add/remove <tag> --ids 1,2,3)");
tagCmd.command("add <tag>").description("Add tag to multiple ideas").requiredOption("--ids <ids>", "Comma-separated idea IDs").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(tagAddCommand));
tagCmd.command("remove <tag>").description("Remove tag from multiple ideas").requiredOption("--ids <ids>", "Comma-separated idea IDs").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(tagRemoveCommand));
tagCmd.argument("[id]").argument("[tags...]").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(async (id, tags, opts) => {
  if (id && tags && tags.length > 0) {
    await tagCommand(id, tags, { json: opts?.json });
  }
}));
program.command("pull <id>").description("Export idea + context as local files").option("--to <dir>", "Output directory (default: current)").option("--json", "Output as JSON (prints idea data instead of writing files)").option("--human", "Force human-readable output").action(wrap(pullCommand));
program.command("diff <id> [id2]").description("Compare two ideas side-by-side (or diff against parent/related)").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(diffCommand));
program.command("branch <id>").description("Fork an idea into a new variant").option("--title <title>", "Override title for the branch").option("--body <body>", "Override body for the branch").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(branchCommand));
program.command("link <source-id> <target-id>").description("Create a link between two ideas").option("--type <type>", "Link type (related|blocks|inspires|supersedes|parent)", "related").option("--note <note>", "Add a note to the link").option("--force", "Bypass cycle detection for soft-block types").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(linkCommand));
program.command("unlink <source-id> <target-id>").description("Remove a link between two ideas").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(unlinkCommand));
program.command("links <id>").description("Show all links for an idea").option("--type <type>", "Filter by link type").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(linksCommand));
program.command("merge <keep-id> <absorb-id>").description("Merge two ideas (absorb the second into the first)").option("--force", "Skip confirmation").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(mergeCommand));
program.command("graph <id>").description("Explore the connection graph from an idea").option("--depth <n>", "Max hops (default: 1, max: 5)").option("--type <types>", "Comma-separated edge types to follow").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(graphCommand));
program.command("rm <id>").description("Archive (soft-delete) an idea").option("--force", "Skip confirmation").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(rmCommand));
var dup = program.command("duplicate").description("Manage duplicate detections");
dup.command("list").description("List pending duplicate detections").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(duplicateListCommand));
dup.command("dismiss <id>").description("Dismiss a duplicate detection").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(duplicateDismissCommand));
dup.command("merge <id>").description("Merge duplicate into primary idea").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(duplicateMergeCommand));
var keys = program.command("key").description("Manage API keys");
keys.command("list").description("List all API keys").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(keysListCommand));
keys.command("create <label>").description("Create a new API key").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(keysCreateCommand));
keys.command("revoke <key-id>").description("Revoke an API key").option("--json", "Output as JSON").option("--human", "Force human-readable output").action(wrap(keysRevokeCommand));
checkForUpdates(VERSION);
program.parse();
function collect(value, previous) {
  return previous.concat([value]);
}
function wrap(fn) {
  return (async (...args) => {
    let jsonMode = false;
    if (args.length >= 2) {
      const opts = args[args.length - 2];
      if (opts && typeof opts === "object" && !(opts instanceof Command)) {
        const o = opts;
        if (o.human) {
          o.json = false;
        } else if (!o.json) {
          const config = await loadConfig();
          if (config?.auth_method === "api-key") {
            o.json = true;
          }
        }
        jsonMode = !!o.json;
      }
    }
    try {
      await fn(...args);
    } catch (err) {
      if (jsonMode) {
        const error = errorToJson(err);
        console.error(JSON.stringify(error));
        process.exit(1);
      }
      if (err instanceof AuthError) {
        console.error(chalk21.red(err.message));
        process.exit(1);
      }
      if (err instanceof ApiError) {
        if (err.status === 401) {
          console.error(chalk21.red("Authentication expired. Run `nrepo login` to re-authenticate."));
        } else if (err.status === 403) {
          console.error(chalk21.yellow("This feature requires a Pro plan. Upgrade at https://neuralrepo.com/settings"));
        } else {
          console.error(chalk21.red(`API error (${err.status}): ${err.message}`));
        }
        process.exit(1);
      }
      if (err instanceof Error && err.message.startsWith("Network error")) {
        console.error(chalk21.red(err.message));
        process.exit(1);
      }
      throw err;
    }
  });
}
function errorToJson(err) {
  if (err instanceof AuthError) {
    return { error: err.message, code: "auth_required" };
  }
  if (err instanceof ApiError) {
    return { error: err.message, code: `http_${err.status}`, status: err.status };
  }
  if (err instanceof Error && err.message.startsWith("Network error")) {
    return { error: err.message, code: "network_error" };
  }
  return { error: String(err), code: "unknown" };
}
