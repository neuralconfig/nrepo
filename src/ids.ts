import type { Config } from './config.js';
import * as api from './api.js';

/**
 * Idea references typed on the command line.
 *
 * The CLI shows each idea's per-user number (`#12`), so that is what a bare
 * number means: `12` and `#12` both name your idea #12. Scripts that hold a
 * global id from `--json` output can pass it as `id:698`.
 */
export type IdeaRef = { kind: 'number'; value: number } | { kind: 'id'; value: number };

export interface ResolvedIdea {
  id: number;
  /** How to print this idea back to the user: `#12` or `id:698`. */
  label: string;
}

export class IdeaRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdeaRefError';
  }
}

export function parseIdeaRef(raw: string): IdeaRef {
  const s = raw.trim();
  const global = /^id:(\d+)$/i.exec(s);
  if (global) return { kind: 'id', value: Number(global[1]) };
  const num = /^#?(\d+)$/.exec(s);
  if (num && Number(num[1]) > 0) return { kind: 'number', value: Number(num[1]) };
  throw new IdeaRefError(`"${raw}" is not an idea number. Use 12 or #12 (or id:698 for a global id).`);
}

/** Splits a `--ids 1,#2,id:3` value into refs. */
export function parseIdeaRefList(raw: string): IdeaRef[] {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new IdeaRefError('Provide at least one idea number with --ids');
  return parts.map(parseIdeaRef);
}

/** Resolves refs to global ids in one request, keeping input order. */
export async function resolveIdeaRefs(config: Config, refs: IdeaRef[]): Promise<ResolvedIdea[]> {
  const numbers = [...new Set(refs.filter((r) => r.kind === 'number').map((r) => r.value))];
  const byNumber = new Map<number, number>();
  // The server caps one lookup at 100 numbers.
  for (let i = 0; i < numbers.length; i += 100) {
    const { results } = await api.resolveIdeaNumbers(config, numbers.slice(i, i + 100));
    for (const r of results) byNumber.set(r.number, r.id);
  }

  return refs.map((ref) => {
    if (ref.kind === 'id') return { id: ref.value, label: `id:${ref.value}` };
    const id = byNumber.get(ref.value);
    if (id == null) throw new IdeaRefError(`Idea #${ref.value} not found.`);
    return { id, label: `#${ref.value}` };
  });
}

export async function resolveIdea(config: Config, raw: string): Promise<ResolvedIdea> {
  const [resolved] = await resolveIdeaRefs(config, [parseIdeaRef(raw)]);
  return resolved!;
}

/** Resolves two refs (link, merge, diff) in one request. */
export async function resolveIdeaPair(
  config: Config,
  a: string,
  b: string,
): Promise<[ResolvedIdea, ResolvedIdea]> {
  const [first, second] = await resolveIdeaRefs(config, [parseIdeaRef(a), parseIdeaRef(b)]);
  return [first!, second!];
}

export async function resolveIdeaList(config: Config, raw: string): Promise<ResolvedIdea[]> {
  return resolveIdeaRefs(config, parseIdeaRefList(raw));
}

/** Label for a global id in bulk results, falling back to `id:N`. */
export function labelFor(resolved: ResolvedIdea[], id: number): string {
  return resolved.find((r) => r.id === id)?.label ?? `id:${id}`;
}
