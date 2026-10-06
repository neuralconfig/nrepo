import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IdeaRefError,
  labelFor,
  parseIdeaRef,
  parseIdeaRefList,
  resolveIdea,
  resolveIdeaList,
  resolveIdeaPair,
} from '../src/ids.js';
import { splitTags } from '../src/tags.js';
import { apiErrorMessage, CLIENT_HEADER } from '../src/api.js';
import { cliAuthUrl, parseLoginProvider } from '../src/commands/login.js';
import { VERSION } from '../src/version.js';
import type { Config } from '../src/config.js';

const config: Config = { api_url: 'https://example.test/api/v1', api_key: 'nrp_test' };

/** Stubs fetch with a by-number lookup over `table` (number → global id). */
function stubLookup(table: Record<number, number>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const numbers = (url.searchParams.get('numbers') ?? '').split(',').map(Number);
    const results = numbers.filter((n) => n in table).map((n) => ({ number: n, id: table[n]! }));
    return new Response(JSON.stringify({ results }), { status: 200 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('idea references', () => {
  it('reads bare and #-prefixed numbers as per-user numbers', () => {
    expect(parseIdeaRef('12')).toEqual({ kind: 'number', value: 12 });
    expect(parseIdeaRef(' #12 ')).toEqual({ kind: 'number', value: 12 });
  });

  it('reads id:N as a global id', () => {
    expect(parseIdeaRef('id:698')).toEqual({ kind: 'id', value: 698 });
    expect(parseIdeaRef('ID:7')).toEqual({ kind: 'id', value: 7 });
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'abc', '#', '0', '-3', '1.5', 'id:', '#12x']) {
      expect(() => parseIdeaRef(bad)).toThrow(IdeaRefError);
    }
  });

  it('splits --ids lists and rejects an empty one', () => {
    expect(parseIdeaRefList('1, #2,id:3,')).toEqual([
      { kind: 'number', value: 1 },
      { kind: 'number', value: 2 },
      { kind: 'id', value: 3 },
    ]);
    expect(() => parseIdeaRefList(' , ')).toThrow(IdeaRefError);
  });
});

describe('resolving numbers to ids', () => {
  it('routes #12 to the global id the server returns', async () => {
    const fetchSpy = stubLookup({ 12: 698 });
    expect(await resolveIdea(config, '#12')).toEqual({ id: 698, label: '#12' });
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toBe('https://example.test/api/v1/ideas/by-number?numbers=12');
  });

  it('passes id:N through without a request', async () => {
    const fetchSpy = stubLookup({});
    expect(await resolveIdea(config, 'id:698')).toEqual({ id: 698, label: 'id:698' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves a list in one request, keeping order and labels', async () => {
    const fetchSpy = stubLookup({ 1: 101, 2: 102 });
    const resolved = await resolveIdeaList(config, '2,1,id:9,2');
    expect(resolved.map((r) => r.id)).toEqual([102, 101, 9, 102]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(labelFor(resolved, 101)).toBe('#1');
    expect(labelFor(resolved, 9)).toBe('id:9');
    expect(labelFor(resolved, 555)).toBe('id:555');
  });

  it('resolves a pair', async () => {
    stubLookup({ 3: 30, 4: 40 });
    const [a, b] = await resolveIdeaPair(config, '3', '#4');
    expect([a.id, b.id]).toEqual([30, 40]);
  });

  it('names the missing number', async () => {
    stubLookup({ 1: 101 });
    await expect(resolveIdeaList(config, '1,99')).rejects.toThrow('Idea #99 not found.');
  });

  it('splits lookups over 100 numbers', async () => {
    const table = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [i + 1, 1000 + i]));
    const fetchSpy = stubLookup(table);
    const ids = Array.from({ length: 150 }, (_, i) => i + 1).join(',');
    const resolved = await resolveIdeaList(config, ids);
    expect(resolved).toHaveLength(150);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('sends the client header with the API key', async () => {
    const fetchSpy = stubLookup({ 1: 1 });
    await resolveIdea(config, '1');
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('nrp_test');
    expect(headers['X-NeuralRepo-Client']).toBe(`cli/${VERSION}`);
    expect(CLIENT_HEADER['X-NeuralRepo-Client']).toMatch(/^cli\/\d+\.\d+\.\d+/);
  });
});

describe('tags', () => {
  it('splits comma-joined values and repeated flags', () => {
    expect(splitTags(['a,b', 'c', ' b , d ,'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps case and handles no tags', () => {
    expect(splitTags(['iOS'])).toEqual(['iOS']);
    expect(splitTags(undefined)).toEqual([]);
    expect(splitTags([' , '])).toEqual([]);
  });
});

describe('API error messages', () => {
  it('uses a string error as is', () => {
    expect(apiErrorMessage({ error: 'Idea not found' }, 404)).toBe('Idea not found');
  });

  it('flattens validation errors instead of printing [object Object]', () => {
    expect(apiErrorMessage({ error: { title: ['Required'], tags: ['Too many', 'Too long'] } }, 400))
      .toBe('title: Required; tags: Too many, Too long');
  });

  it('falls back to the status', () => {
    expect(apiErrorMessage({}, 502)).toBe('HTTP 502');
    expect(apiErrorMessage(null, 500)).toBe('HTTP 500');
  });
});

describe('login provider', () => {
  it('defaults to the chooser', () => {
    expect(parseLoginProvider(undefined)).toBe('choose');
    expect(cliAuthUrl('https://neuralrepo.com/api/v1', 'http://localhost:5000/callback', 'choose'))
      .toBe('https://neuralrepo.com/auth/cli?callback=http%3A%2F%2Flocalhost%3A5000%2Fcallback&provider=choose');
  });

  it('accepts the methods /auth/cli supports and rejects others', () => {
    expect(parseLoginProvider('Google')).toBe('google');
    expect(parseLoginProvider('magic')).toBe('magic');
    expect(() => parseLoginProvider('facebook')).toThrow('Unknown provider');
  });
});
