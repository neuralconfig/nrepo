import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import type { GroupedRelation } from '../api.js';

interface GraphNode {
  id: number;
  number: number;
  title: string;
  status: string;
  depth: number;
}

interface GraphEdge {
  source: number;
  target: number;
  type: string;
}

export async function graphCommand(
  id: string,
  opts: { depth?: string; type?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const startId = parseInt(id, 10);

  if (isNaN(startId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const maxDepth = Math.min(parseInt(opts.depth ?? '1', 10), 5);
  const typeFilter = opts.type?.split(',');

  const spinner = opts.json ? null : ora('Traversing graph...').start();

  // BFS
  const visited = new Map<number, GraphNode>();
  const edges: GraphEdge[] = [];
  const children = new Map<number, { childId: number; type: string; title: string; status: string }[]>();
  let currentLevel = [startId];
  let depth = 0;

  // Fetch the root idea
  const rootIdea = await api.getIdea(config, startId);
  visited.set(startId, { id: startId, number: rootIdea.number, title: rootIdea.title, status: rootIdea.status, depth: 0 });

  while (depth < maxDepth && currentLevel.length > 0) {
    const nextLevel: number[] = [];

    for (const nodeId of currentLevel) {
      const relations = await api.getIdeaRelations(config, nodeId);

      const allRelations: (GroupedRelation & { direction: 'out' | 'in' })[] = [
        ...relations.outgoing.map((r) => ({ ...r, direction: 'out' as const })),
        ...relations.incoming.map((r) => ({ ...r, direction: 'in' as const })),
      ];

      for (const rel of allRelations) {
        if (typeFilter && !typeFilter.includes(rel.relation_type)) continue;

        const neighborId = rel.idea_id;
        if (visited.has(neighborId)) continue;

        visited.set(neighborId, {
          id: neighborId,
          number: rel.idea_number,
          title: rel.idea_title,
          status: rel.idea_status,
          depth: depth + 1,
        });

        const edgeSource = rel.direction === 'out' ? nodeId : neighborId;
        const edgeTarget = rel.direction === 'out' ? neighborId : nodeId;
        edges.push({ source: edgeSource, target: edgeTarget, type: rel.relation_type });

        // Track parent-child for tree rendering
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
      edges,
    }, null, 2));
    return;
  }

  // ASCII tree output
  const statusStyle: Record<string, (s: string) => string> = {
    captured: chalk.gray,
    exploring: chalk.cyan,
    building: chalk.yellow,
    shipped: chalk.green,
    shelved: chalk.dim,
  };

  const typeColor: Record<string, (s: string) => string> = {
    blocks: chalk.red,
    inspires: chalk.cyan,
    supersedes: chalk.dim,
    parent: chalk.white,
    related: chalk.magenta,
    duplicate: chalk.yellow,
  };

  function renderTree(nodeId: number, prefix: string, isLast: boolean, isRoot: boolean): void {
    const node = visited.get(nodeId)!;
    const style = statusStyle[node.status] ?? chalk.white;
    const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
    const childPrefix = isRoot ? '' : (isLast ? '    ' : '│   ');

    const nodeChildren = children.get(nodeId) ?? [];

    if (isRoot) {
      console.log(`#${node.number} ${node.title} ${style(`[${node.status}]`)}`);
    } else {
      const parentRel = nodeChildren.length > 0 ? '' : '';
      console.log(`${prefix}${connector}#${node.number} ${node.title} ${style(`[${node.status}]`)}`);
    }

    for (const [i, child] of nodeChildren.entries()) {
      const last = i === nodeChildren.length - 1;
      const tc = typeColor[child.type] ?? chalk.white;
      const childNode = visited.get(child.childId)!;
      const childStyle = statusStyle[childNode.status] ?? chalk.white;
      const childConnector = last ? '└── ' : '├── ';
      const nextPrefix = prefix + childPrefix + (last ? '    ' : '│   ');

      console.log(
        `${prefix}${childPrefix}${childConnector}${tc(child.type)} → #${childNode.number} ${child.title} ${childStyle(`[${childNode.status}]`)}`
      );

      // Recurse into grandchildren
      const grandchildren = children.get(child.childId) ?? [];
      for (const [j, gc] of grandchildren.entries()) {
        const gcLast = j === grandchildren.length - 1;
        const gcNode = visited.get(gc.childId);
        if (!gcNode) continue;
        const gcStyle = statusStyle[gcNode.status] ?? chalk.white;
        const gcTc = typeColor[gc.type] ?? chalk.white;
        const gcConnector = gcLast ? '└── ' : '├── ';
        console.log(
          `${nextPrefix}${gcConnector}${gcTc(gc.type)} → #${gcNode.number} ${gc.title} ${gcStyle(`[${gcNode.status}]`)}`
        );
      }
    }
  }

  if (visited.size === 1) {
    const root = visited.get(startId)!;
    const style = statusStyle[root.status] ?? chalk.white;
    console.log(`#${root.number} ${root.title} ${style(`[${root.status}]`)}`);
    console.log(chalk.dim('  No connections found'));
  } else {
    renderTree(startId, '', true, true);
  }
}
