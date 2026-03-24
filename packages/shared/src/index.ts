// ============================================================
// @neuralrepo/shared — Zod schemas, types, and constants
// Shared between Worker API, CLI, and frontend
// ============================================================

import { z } from 'zod';

// ============================================================
// Enums & constants
// ============================================================

export const IDEA_STATUSES = ['captured', 'exploring', 'building', 'shipped', 'shelved'] as const;
export const IDEA_SOURCES = ['web', 'cli', 'claude-mcp', 'siri', 'email', 'api', 'shortcut'] as const;
export const LINK_TYPES = ['url', 'claude-chat', 'github-repo', 'github-issue', 'attachment'] as const;
export const RELATION_TYPES = ['related', 'parent', 'blocks', 'inspires', 'duplicate', 'supersedes'] as const;
export const DUPLICATE_STATUSES = ['pending', 'merged', 'dismissed'] as const;
export const PLANS = ['free', 'pro'] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type IdeaSource = (typeof IDEA_SOURCES)[number];
export type LinkType = (typeof LINK_TYPES)[number];
export type RelationType = (typeof RELATION_TYPES)[number];
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];
export type Plan = (typeof PLANS)[number];

// ============================================================
// Source display icons
// ============================================================

export const SOURCE_ICONS: Record<IdeaSource, string> = {
  'claude-mcp': '◈',
  siri: '◉',
  web: '◎',
  cli: '⬡',
  email: '✉',
  api: '⚙',
  shortcut: '⌘',
};

// ============================================================
// Status display colors (for terminal output)
// ============================================================

export const STATUS_COLORS: Record<IdeaStatus, string> = {
  captured: 'gray',
  exploring: 'cyan',
  building: 'yellow',
  shipped: 'green',
  shelved: 'dim',
};

// ============================================================
// Field limits — single source of truth for all validation
// Adjust these values to change limits across API, MCP, and CLI
// ============================================================

export const LIMITS = {
  /** Max characters for idea title */
  IDEA_TITLE_MAX: 200,
  /** Max characters for idea body */
  IDEA_BODY_MAX: 50_000,
  /** Max tags per idea */
  IDEA_TAGS_MAX: 20,
  /** Max characters per tag name */
  TAG_NAME_MAX: 50,
  /** Max characters for a source URL */
  SOURCE_URL_MAX: 2_000,
  /** Max characters for display name */
  DISPLAY_NAME_MAX: 100,
  /** Max characters for API key label */
  API_KEY_LABEL_MAX: 100,
  /** Max characters for settings JSON blob */
  SETTINGS_JSON_MAX: 10_000,
  /** Max characters for search query */
  SEARCH_QUERY_MAX: 500,
  /** Max items per list request */
  LIST_LIMIT_MAX: 100,
  /** Default items per list request */
  LIST_LIMIT_DEFAULT: 20,
} as const;

// ============================================================
// User settings schema
// ============================================================

export const UserSettingsSchema = z.object({
  preferred_ai_provider: z.string().optional(),
  search_threshold: z.number().min(0.1).max(0.9).optional(),
  dedup_threshold: z.number().min(0.1).max(0.9).optional(),
  related_threshold: z.number().min(0.1).max(0.9).optional(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

export function parseUserSettings(json: string): UserSettings {
  try {
    const parsed = UserSettingsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// ============================================================
// Request schemas (Zod)
// ============================================================

export const CreateIdeaSchema = z.object({
  title: z.string().min(1).max(LIMITS.IDEA_TITLE_MAX),
  body: z.string().max(LIMITS.IDEA_BODY_MAX).optional(),
  tags: z.array(z.string().min(1).max(LIMITS.TAG_NAME_MAX)).max(LIMITS.IDEA_TAGS_MAX).optional(),
  source: z.enum(IDEA_SOURCES).optional(),
  source_url: z.string().url().max(LIMITS.SOURCE_URL_MAX).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  parent_id: z.number().int().positive().optional(),
});

export const UpdateIdeaSchema = z.object({
  title: z.string().min(1).max(LIMITS.IDEA_TITLE_MAX).optional(),
  body: z.string().max(LIMITS.IDEA_BODY_MAX).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().min(1).max(LIMITS.TAG_NAME_MAX)).max(LIMITS.IDEA_TAGS_MAX).optional(),
});

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(LIMITS.TAG_NAME_MAX),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(LIMITS.TAG_NAME_MAX).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(LIMITS.DISPLAY_NAME_MAX).optional(),
  settings_json: z.string().max(LIMITS.SETTINGS_JSON_MAX).optional(),
});

export const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(LIMITS.API_KEY_LABEL_MAX).optional().default('default'),
});

export const CreateRelationSchema = z.object({
  source_idea_id: z.number().int().positive(),
  target_idea_id: z.number().int().positive(),
  relation_type: z.enum(RELATION_TYPES).default('related'),
  note: z.string().max(500).optional(),
});

export const UpdateRelationSchema = z.object({
  relation_type: z.enum(RELATION_TYPES).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const MergeIdeasSchema = z.object({
  absorb_id: z.number().int().positive(),
});

export const CreateUrlLinkSchema = z.object({
  url: z.string().url().max(LIMITS.SOURCE_URL_MAX),
  title: z.string().max(LIMITS.IDEA_TITLE_MAX).optional(),
  link_type: z.enum(LINK_TYPES).default('url'),
});

// Inferred request types
export type CreateIdeaInput = z.infer<typeof CreateIdeaSchema>;
export type UpdateIdeaInput = z.infer<typeof UpdateIdeaSchema>;
export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type CreateRelationInput = z.infer<typeof CreateRelationSchema>;
export type UpdateRelationInput = z.infer<typeof UpdateRelationSchema>;
export type MergeIdeasInput = z.infer<typeof MergeIdeasSchema>;
export type CreateUrlLinkInput = z.infer<typeof CreateUrlLinkSchema>;

// ============================================================
// API response types
// ============================================================

export interface ApiIdea {
  id: number;
  title: string;
  body: string | null;
  status: IdeaStatus;
  source: IdeaSource;
  source_url: string | null;
  vectorize_id: string | null;
  tags: string[];
  links?: ApiIdeaLink[];
  relations?: ApiIdeaRelation[];
  is_archived: number;
  created_at: string;
  updated_at: string;
  processing?: boolean;
  score?: number | null;
}

export interface ApiIdeaLink {
  id: number;
  url: string;
  title: string | null;
  link_type: LinkType;
  created_at: string;
}

export interface ApiIdeaRelation {
  id: number;
  source_idea_id: number;
  target_idea_id: number;
  relation_type: RelationType;
  score: number | null;
  note: string | null;
  related_idea_title?: string;
}

export interface ApiGroupedRelation {
  id: number;
  relation_type: RelationType;
  score: number | null;
  note: string | null;
  created_at: string;
  idea: {
    id: number;
    title: string;
    status: IdeaStatus;
    tags: string[];
  };
}

export interface ApiGroupedRelations {
  outgoing: ApiGroupedRelation[];
  incoming: ApiGroupedRelation[];
}

export interface ApiDuplicateDetection {
  id: number;
  idea_id: number;
  duplicate_of_id: number;
  similarity_score: number;
  status: DuplicateStatus;
  idea_title: string;
  duplicate_title: string;
  created_at: string;
}

export interface ApiTag {
  id: number;
  name: string;
  color: string | null;
  idea_count: number;
}

export interface ApiUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: Plan;
  settings_json: string;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_openrouter_key: boolean;
  has_github_sync: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyInfo {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiKeyCreated {
  id: string;
  key: string;
  label: string;
  created_at: string;
}

// ============================================================
// API list response wrappers
// ============================================================

export interface IdeasResponse {
  ideas: ApiIdea[];
}

export interface SearchResponse {
  query: string;
  results: ApiIdea[];
  search_type: 'semantic' | 'fts';
}

export interface DuplicatesResponse {
  duplicates: ApiDuplicateDetection[];
}

export interface TagsResponse {
  tags: ApiTag[];
}

export interface ApiKeysResponse {
  api_keys: ApiKeyInfo[];
}

export interface ApiError {
  error: string;
}

export interface ApiSuccess {
  success: boolean;
}
