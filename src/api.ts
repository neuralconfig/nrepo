import type { Config } from './config.js';
import type {
  ApiIdea,
  ApiUser,
  ApiTag,
  ApiDuplicateDetection,
  ApiKeyInfo,
  ApiKeyCreated,
  ApiIdeaRelation,
  ApiIdeaLink,
  IdeasResponse,
  SearchResponse,
  DuplicatesResponse,
  TagsResponse,
  ApiKeysResponse,
  ApiSuccess,
  CreateIdeaInput,
  UpdateIdeaInput,
} from '@neuralrepo/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(config: Config, method: string, path: string, body?: unknown): Promise<T> {
  const url = `${config.api_url}${path}`;
  const headers: Record<string, string> = {
    'X-API-Key': config.api_key,
    'Content-Type': 'application/json',
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Network error: ${(err as Error).message}. Check your internet connection and try again.`,
    );
  }

  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(
      (json as { error?: string }).error ?? `HTTP ${res.status}`,
      res.status,
      json as Record<string, unknown>,
    );
  }

  return res.json() as Promise<T>;
}

// User
export const getMe = (c: Config) => request<ApiUser>(c, 'GET', '/user/me');

// Ideas
export const listIdeas = (c: Config, params?: { status?: string; tag?: string; limit?: number; offset?: number }) => {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.tag) sp.set('tag', params.tag);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return request<IdeasResponse>(c, 'GET', `/ideas${qs ? `?${qs}` : ''}`);
};

export const createIdea = (c: Config, data: CreateIdeaInput) =>
  request<ApiIdea & { processing?: boolean }>(c, 'POST', '/ideas', data);

export const getIdea = (c: Config, id: number) =>
  request<ApiIdea & { links: ApiIdeaLink[]; relations: ApiIdeaRelation[] }>(c, 'GET', `/ideas/${id}`);

export const updateIdea = (c: Config, id: number, data: UpdateIdeaInput) =>
  request<ApiIdea>(c, 'PATCH', `/ideas/${id}`, data);

export interface BulkUpdateInput {
  ids: number[];
  status?: string;
  tags?: string[];
  add_tags?: string[];
  remove_tags?: string[];
}

export interface BulkUpdateResult {
  id: number;
  status: 'updated' | 'error';
  error?: string;
}

export const bulkUpdateIdeas = (c: Config, data: BulkUpdateInput) =>
  request<{ updated: number; errors: number; results: BulkUpdateResult[] }>(c, 'PATCH', '/ideas/bulk', data);

export const searchIdeas = (c: Config, query: string, limit?: number) => {
  const sp = new URLSearchParams({ q: query });
  if (limit) sp.set('limit', String(limit));
  return request<SearchResponse>(c, 'GET', `/ideas/search?${sp.toString()}`);
};

// Duplicates
export const listDuplicates = (c: Config) =>
  request<DuplicatesResponse>(c, 'GET', '/ideas/duplicates');

// Tags
export const listTags = (c: Config) =>
  request<TagsResponse>(c, 'GET', '/tags');

// API Keys
export const listApiKeys = (c: Config) =>
  request<ApiKeysResponse>(c, 'GET', '/user/api-keys');

export const createApiKey = (c: Config, label: string) =>
  request<ApiKeyCreated>(c, 'POST', '/user/api-keys', { label });

export const deleteApiKey = (c: Config, keyId: string) =>
  request<ApiSuccess>(c, 'DELETE', `/user/api-keys/${keyId}`);

// Relations
export interface GroupedRelation {
  id: number;
  relation_type: string;
  score: number | null;
  note: string | null;
  created_at: string;
  idea_id: number;
  idea_number: number;
  idea_title: string;
  idea_status: string;
}

export interface GroupedRelations {
  outgoing: GroupedRelation[];
  incoming: GroupedRelation[];
}

export const getIdeaRelations = (c: Config, id: number) =>
  request<GroupedRelations>(c, 'GET', `/ideas/${id}/relations`);

export const createRelation = (
  c: Config,
  sourceId: number,
  targetId: number,
  relationType: string = 'related',
  note?: string,
  force?: boolean,
) => {
  const qs = force ? '?force=true' : '';
  return request<{ relation: ApiIdeaRelation }>(c, 'POST', `/map/relations${qs}`, {
    source_idea_id: sourceId,
    target_idea_id: targetId,
    relation_type: relationType,
    ...(note ? { note } : {}),
  });
};

export interface BulkLinkInput {
  source_idea_id: number;
  target_idea_id: number;
  relation_type?: string;
  note?: string;
}

export interface BulkLinkResult {
  source_idea_id: number;
  target_idea_id: number;
  relation_type: string;
  status: 'created' | 'error';
  relation_id?: number;
  error?: string;
}

export const createBulkRelations = (
  c: Config,
  links: BulkLinkInput[],
  force?: boolean,
) => {
  const qs = force ? '?force=true' : '';
  return request<{ linked: number; errors: number; results: BulkLinkResult[] }>(c, 'POST', `/map/relations${qs}`, { links });
};

export const deleteRelation = (c: Config, relationId: number) =>
  request<ApiSuccess>(c, 'DELETE', `/map/relations/${relationId}`);

// Archive (soft delete)
export const deleteIdea = (c: Config, id: number) =>
  request<ApiSuccess>(c, 'DELETE', `/ideas/${id}`);

// Duplicates
export const dismissDuplicate = (c: Config, dupId: number) =>
  request<ApiSuccess>(c, 'POST', `/ideas/duplicates/${dupId}/dismiss`);

export const mergeDuplicate = (c: Config, dupId: number) =>
  request<ApiSuccess>(c, 'POST', `/ideas/duplicates/${dupId}/merge`);

// Merge
export const mergeIdeas = (c: Config, keepId: number, absorbId: number) =>
  request<ApiIdea>(c, 'POST', `/ideas/${keepId}/merge`, { absorb_id: absorbId });
