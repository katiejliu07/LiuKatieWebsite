import { ProjectNode } from '../types';

export const NODE_WIDTH = 196;
export const NODE_HEIGHT = 88;
export const NODE_MAX_HEIGHT = 120;
const COL_STEP = NODE_WIDTH + 88;
const ROW_STEP = NODE_MAX_HEIGHT + 28;
const PADDING = 44;

/**
 * Node cards are allowed to grow for wrapped titles, but the timeline math still
 * uses NODE_MAX_HEIGHT for row spacing so a long title cannot overlap neighbors.
 */
export function getNodeHeight(node: Pick<ProjectNode, 'title'>): number {
  const words = node.title.trim().split(/\s+/).filter(Boolean);
  let lines = 1;
  let current = 0;
  const charsPerLine = 22;

  for (const word of words) {
    const next = current === 0 ? word.length : current + 1 + word.length;
    if (next > charsPerLine && current > 0) {
      lines += 1;
      current = word.length;
    } else {
      current = next;
    }
  }

  const clampedLines = Math.min(3, Math.max(1, lines));
  return NODE_HEIGHT + Math.max(0, clampedLines - 1) * 16;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface LayoutResult {
  positions: Record<string, NodePosition>;
  canvasWidth: number;
  canvasHeight: number;
}

// ── Topological layout (used by standalone TreeCanvas) ─────────────────────

export function computeTreeLayout(
  nodes: ProjectNode[],
  direction: 'forward' | 'backward' = 'forward',
): LayoutResult {
  if (nodes.length === 0) return { positions: {}, canvasWidth: 400, canvasHeight: 200 };

  const nodeIds = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();

  for (const node of nodes) {
    childrenOf.set(node.id, []);
    parentsOf.set(node.id, node.parentIds.filter((id) => nodeIds.has(id)));
  }
  for (const node of nodes) {
    for (const pid of parentsOf.get(node.id)!) {
      childrenOf.get(pid)!.push(node.id);
    }
  }

  const colOf = new Map<string, number>();
  function assignCol(id: string, col: number) {
    if ((colOf.get(id) ?? -1) < col) {
      colOf.set(id, col);
      for (const cid of childrenOf.get(id)!) assignCol(cid, col + 1);
    }
  }
  for (const node of nodes) {
    if (parentsOf.get(node.id)!.length === 0) assignCol(node.id, 0);
  }
  for (const node of nodes) { if (!colOf.has(node.id)) colOf.set(node.id, 0); }

  const maxCol = Math.max(...colOf.values());
  const colGroups = new Map<number, string[]>();
  for (const [id, col] of colOf) {
    if (!colGroups.has(col)) colGroups.set(col, []);
    colGroups.get(col)!.push(id);
  }

  const rowOf = new Map<string, number>();
  for (const [, ids] of colGroups) ids.forEach((id, i) => rowOf.set(id, i));

  for (let col = 1; col <= maxCol; col++) {
    const ids = colGroups.get(col) ?? [];
    const w = ids.map((id) => {
      const pr = parentsOf.get(id)!.map((pid) => rowOf.get(pid) ?? 0);
      return { id, avg: pr.length ? pr.reduce((a, b) => a + b, 0) / pr.length : rowOf.get(id) ?? 0 };
    });
    w.sort((a, b) => a.avg - b.avg);
    w.forEach(({ id }, i) => { rowOf.set(id, i); colGroups.get(col)![i] = id; });
  }
  for (let col = maxCol - 1; col >= 0; col--) {
    const ids = colGroups.get(col) ?? [];
    const w = ids.map((id) => {
      const cr = childrenOf.get(id)!.map((cid) => rowOf.get(cid) ?? 0);
      return { id, avg: cr.length ? cr.reduce((a, b) => a + b, 0) / cr.length : rowOf.get(id) ?? 0 };
    });
    w.sort((a, b) => a.avg - b.avg);
    w.forEach(({ id }, i) => { rowOf.set(id, i); });
  }

  const positions: Record<string, NodePosition> = {};
  for (const node of nodes) {
    const col = colOf.get(node.id) ?? 0;
    const row = rowOf.get(node.id) ?? 0;
    const displayCol = direction === 'forward' ? col : maxCol - col;
    positions[node.id] = { x: PADDING + displayCol * COL_STEP, y: PADDING + row * ROW_STEP };
  }

  let maxRow = 0;
  for (const ids of colGroups.values()) maxRow = Math.max(maxRow, ids.length - 1);

  return {
    positions,
    canvasWidth: PADDING * 2 + (maxCol + 1) * COL_STEP,
    canvasHeight: PADDING * 2 + (maxRow + 1) * ROW_STEP,
  };
}

// ── Unified timeline layout ─────────────────────────────────────────────────

const DAYS_MS = 86_400_000;
const BAND_PAD = 36;
const DIVIDER_H = 52;
const ROW_H = NODE_MAX_HEIGHT + 28;
const X_OFFSET = 72;
const CARD_X_PAD = 18;

export interface TimeScale {
  minMs: number;
  maxMs: number;
  rangeMs: number;
  pxPerMs: number;
  direction: 'forward' | 'backward';
  xOffset: number;
}

export interface UnifiedLayout {
  positions: Record<string, NodePosition>;
  totalWidth: number;
  totalHeight: number;
  treeBands: Array<{ treeId: string; yStart: number; height: number; label: string; xMin: number; xMax: number }>;
  ticks: Array<{ x: number; label: string; isMajor: boolean }>;
  timeScale: TimeScale;
}

export function rowIndexFromY(y: number): number {
  return Math.max(0, Math.round((y - BAND_PAD) / ROW_H));
}

export function yForRowIndex(row: number): number {
  return BAND_PAD + Math.max(0, row) * ROW_H;
}

export function xToMs(x: number, ts: TimeScale): number {
  const offset = x - ts.xOffset;
  if (ts.direction === 'forward') return ts.minMs + offset / ts.pxPerMs;
  return ts.maxMs - offset / ts.pxPerMs;
}

/** Parse YYYY-MM or YYYY-MM-DD → timestamp */
export function parseNodeDate(dateStr: string): number {
  if (/^\d{4}-\d{2}$/.test(dateStr)) return new Date(dateStr + '-01').getTime();
  return new Date(dateStr).getTime();
}

/** Format a stored YYYY-MM string as "Sep 2023" without timezone distortion. */
export function fmtMonthYear(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})/)
  if (!m) return dateStr
  const month = parseInt(m[2]) - 1
  if (month < 0 || month > 11) return dateStr
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[month]} ${m[1]}`
}

/** Convert stored date string to YYYY-MM for month input value */
export function toMonthInputValue(dateStr: string): string {
  return dateStr.slice(0, 7); // works for both YYYY-MM and YYYY-MM-DD
}

/** Assign virtual timestamps to undated nodes by propagating from parents */
export function assignVirtualDates(nodes: ProjectNode[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const dates = new Map<string, number>();

  for (const n of nodes) {
    // End date is the canonical position: a project "lives" at when it finishes, not when it started
    const anchor = n.dateEnd ?? n.dateStart;
    if (anchor) dates.set(n.id, parseNodeDate(anchor));
  }

  // Up to 8 passes to handle chains of undated nodes
  for (let pass = 0; pass < 8; pass++) {
    for (const n of nodes) {
      if (dates.has(n.id)) continue;
      const pd = n.parentIds
        .filter((id) => nodeIds.has(id) && dates.has(id))
        .map((id) => dates.get(id)!);
      if (pd.length > 0) dates.set(n.id, Math.max(...pd) + 180 * DAYS_MS);
    }
  }

  const fallback =
    dates.size > 0 ? Math.max(...dates.values()) + 180 * DAYS_MS : Date.now() + 180 * DAYS_MS;
  for (const n of nodes) { if (!dates.has(n.id)) dates.set(n.id, fallback); }

  return dates;
}

function buildAdjacency(nodes: ProjectNode[]) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const n of nodes) {
    childrenOf.set(n.id, []);
    parentsOf.set(n.id, n.parentIds.filter((id) => nodeIds.has(id)));
  }
  for (const n of nodes) {
    for (const pid of parentsOf.get(n.id)!) childrenOf.get(pid)!.push(n.id);
  }
  return { childrenOf, parentsOf };
}

function barycentreRows(nodes: ProjectNode[], childrenOf: Map<string, string[]>, parentsOf: Map<string, string[]>) {
  const rowHintMap = new Map(nodes.map((n) => [n.id, n.rowHint ?? 0]));

  const colOf = new Map<string, number>();
  function ac(id: string, c: number) {
    if ((colOf.get(id) ?? -1) < c) {
      colOf.set(id, c);
      for (const cid of childrenOf.get(id)!) ac(cid, c + 1);
    }
  }
  for (const n of nodes) { if (parentsOf.get(n.id)!.length === 0) ac(n.id, 0); }
  for (const n of nodes) { if (!colOf.has(n.id)) colOf.set(n.id, 0); }

  const maxCol = Math.max(...colOf.values(), 0);
  const colGroups = new Map<number, string[]>();
  for (const [id, col] of colOf) {
    if (!colGroups.has(col)) colGroups.set(col, []);
    colGroups.get(col)!.push(id);
  }

  // Initial order: respect rowHint as the user-defined tiebreaker
  const rowOf = new Map<string, number>();
  for (const [col, ids] of colGroups) {
    const sorted = [...ids].sort((a, b) => (rowHintMap.get(a) ?? 0) - (rowHintMap.get(b) ?? 0));
    sorted.forEach((id, i) => rowOf.set(id, i));
    colGroups.set(col, sorted);
  }

  for (let col = 1; col <= maxCol; col++) {
    const ids = colGroups.get(col) ?? [];
    const w = ids.map((id) => {
      const pr = parentsOf.get(id)!.map((pid) => rowOf.get(pid) ?? 0);
      return { id, avg: pr.length ? pr.reduce((a, b) => a + b, 0) / pr.length : (rowOf.get(id) ?? 0) };
    });
    w.sort((a, b) => a.avg - b.avg);
    w.forEach(({ id }, i) => { rowOf.set(id, i); colGroups.get(col)![i] = id; });
  }
  for (let col = maxCol - 1; col >= 0; col--) {
    const ids = colGroups.get(col) ?? [];
    const w = ids.map((id) => {
      const cr = childrenOf.get(id)!.map((cid) => rowOf.get(cid) ?? 0);
      return { id, avg: cr.length ? cr.reduce((a, b) => a + b, 0) / cr.length : (rowOf.get(id) ?? 0) };
    });
    w.sort((a, b) => a.avg - b.avg);
    w.forEach(({ id }, i) => { rowOf.set(id, i); });
  }

  let maxRow = 0;
  for (const ids of colGroups.values()) maxRow = Math.max(maxRow, ids.length - 1);

  return { rowOf, maxRow };
}

function startSortMs(node: ProjectNode, fallbackMs: number): number {
  return node.dateStart ? parseNodeDate(node.dateStart) : fallbackMs;
}

export function computeUnifiedLayout(
  treesData: Array<{ treeId: string; label: string; nodes: ProjectNode[] }>,
  direction: 'forward' | 'backward',
): UnifiedLayout {
  const allNodes = treesData.flatMap((t) => t.nodes);
  if (allNodes.length === 0) {
    const emptyScale: TimeScale = { minMs: 0, maxMs: 0, rangeMs: 0, pxPerMs: 0, direction, xOffset: X_OFFSET };
    return { positions: {}, totalWidth: 1000, totalHeight: 400, treeBands: [], ticks: [], timeScale: emptyScale };
  }

  const dateMs = assignVirtualDates(allNodes);

  const allDates = [...dateMs.values()];
  const minMs = Math.min(...allDates);
  const maxMs = Math.max(...allDates) + 100 * DAYS_MS;
  const rangeMs = maxMs - minMs;

  // Dynamic scale: aim for ~160px per month, clamped
  const months = rangeMs / (30 * DAYS_MS);
  const pxPerMonth = Math.max(130, Math.min(360, 1800 / months));
  const pxPerMs = pxPerMonth / (30 * DAYS_MS);

  function toX(ms: number): number {
    const offset = (ms - minMs) * pxPerMs;
    return direction === 'forward'
      ? X_OFFSET + offset
      : X_OFFSET + rangeMs * pxPerMs - offset;
  }

  const totalWidth = Math.max(900, X_OFFSET * 2 + rangeMs * pxPerMs);

  const positions: Record<string, NodePosition> = {};
  const treeBands: UnifiedLayout['treeBands'] = [];

  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const treeLabelById = new Map(treesData.map((tree) => [tree.treeId, tree.label]));
  const parentsOf = new Map<string, string[]>();
  for (const node of allNodes) {
    parentsOf.set(node.id, node.parentIds.filter((id) => nodeById.has(id)));
  }

  const depthOf = new Map<string, number>();
  function depth(id: string, visiting = new Set<string>()): number {
    if (depthOf.has(id)) return depthOf.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    const value = parents.length > 0 ? 1 + Math.max(...parents.map((parentId) => depth(parentId, visiting))) : 0;
    visiting.delete(id);
    depthOf.set(id, value);
    return value;
  }
  for (const node of allNodes) depth(node.id);

  type LayoutItem = {
    node: ProjectNode;
    treeId: string;
    label: string;
    x: number;
    xMin: number;
    xMax: number;
    endMs: number;
    startMs: number;
    parentIds: string[];
    depth: number;
  };
  type PlacedNode = LayoutItem & { row: number; y: number };

  const orderedItems: LayoutItem[] = allNodes
    .map((node) => {
      const endMs = dateMs.get(node.id) ?? minMs;
      const x = toX(endMs);
      return {
        node,
        treeId: node.treeId,
        label: treeLabelById.get(node.treeId) ?? 'Untitled',
        x,
        xMin: x - CARD_X_PAD,
        xMax: x + NODE_WIDTH + CARD_X_PAD,
        endMs,
        startMs: startSortMs(node, endMs),
        parentIds: parentsOf.get(node.id) ?? [],
        depth: depthOf.get(node.id) ?? 0,
      };
    })
    .sort((a, b) => {
      // Same end date: the project that started earlier gets first claim on the higher row.
      return (
        a.endMs - b.endMs ||
        a.startMs - b.startMs ||
        (a.node.rowHint ?? 0) - (b.node.rowHint ?? 0) ||
        a.depth - b.depth ||
        a.node.title.localeCompare(b.node.title)
      );
    });

  const placed: PlacedNode[] = [];
  const placedById = new Map<string, PlacedNode>();
  const placedByRow = new Map<number, PlacedNode[]>();

  function rowHasCollision(row: number, item: LayoutItem) {
    return (placedByRow.get(row) ?? []).some((other) => item.xMin < other.xMax && item.xMax > other.xMin);
  }

  function chooseRow(item: LayoutItem) {
    const manualFloor = Math.max(0, item.node.rowHint ?? 0);
    const rowLimit = placed.length + 12;

    // Only card overlap pushes nodes down. Edges may pass behind unrelated cards;
    // SmartEdge masks those crossings so auto-layout does not send nodes far away.
    for (let row = manualFloor; row <= rowLimit; row++) {
      if (rowHasCollision(row, item)) continue;
      return row;
    }

    // Fallback: never overlap cards even if an edge has to pass behind one.
    for (let row = manualFloor; row <= rowLimit + 12; row++) {
      if (!rowHasCollision(row, item)) return row;
    }

    return rowLimit + 13;
  }

  const remaining = [...orderedItems];
  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex((item) => item.parentIds.every((id) => placedById.has(id) || !nodeById.has(id)));
    const [item] = remaining.splice(readyIndex === -1 ? 0 : readyIndex, 1);
    const row = chooseRow(item);
    const placedNode: PlacedNode = { ...item, row, y: BAND_PAD + row * ROW_H };

    placed.push(placedNode);
    placedById.set(item.node.id, placedNode);
    if (!placedByRow.has(row)) placedByRow.set(row, []);
    placedByRow.get(row)!.push(placedNode);
    positions[item.node.id] = { x: item.x, y: placedNode.y };
  }

  for (const { treeId, label, nodes } of treesData) {
    const treePlaced = nodes
      .map((node) => placedById.get(node.id))
      .filter((node): node is PlacedNode => !!node);
    if (treePlaced.length === 0) continue;

    const minRow = Math.min(...treePlaced.map((node) => node.row));
    const maxRow = Math.max(...treePlaced.map((node) => node.row));
    treeBands.push({
      treeId,
      label,
      yStart: BAND_PAD + minRow * ROW_H,
      height: (maxRow - minRow + 1) * ROW_H,
      xMin: Math.min(...treePlaced.map((node) => node.xMin)),
      xMax: Math.max(...treePlaced.map((node) => node.xMax)),
    });
  }

  const maxGlobalRow = placed.length > 0 ? Math.max(...placed.map((node) => node.row)) : 0;
  const totalHeight = Math.max(400, BAND_PAD * 2 + (maxGlobalRow + 1) * ROW_H);

  // Monthly timeline ticks
  const ticks: UnifiedLayout['ticks'] = [];
  const startD = new Date(minMs);
  startD.setDate(1); startD.setHours(0, 0, 0, 0);
  const endD = new Date(maxMs);
  const d = new Date(startD);
  while (d <= endD) {
    ticks.push({
      x: toX(d.getTime()),
      label: d.getMonth() === 0
        ? d.getFullYear().toString()
        : d.toLocaleDateString('en-US', { month: 'short' }),
      isMajor: d.getMonth() === 0 || d.getMonth() === 6,
    });
    d.setMonth(d.getMonth() + 1);
  }

  const timeScale: TimeScale = { minMs, maxMs, rangeMs, pxPerMs, direction, xOffset: X_OFFSET };

  return { positions, totalWidth, totalHeight, treeBands, ticks, timeScale };
}
