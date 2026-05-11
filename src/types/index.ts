export type NodeStatus = 'completed' | 'active' | 'planned' | 'future';
export type NodeCategory = 'software' | 'hardware' | 'mixed';
export type NodeMediaType = 'image' | 'video';

export interface NodeMedia {
  id?: string;
  type: NodeMediaType;
  url: string;
  caption?: string;
}

export interface ProjectNode {
  id: string;
  treeId: string;
  title: string;
  description?: string;
  /**
   * Legacy single-media URL kept for old saved nodes and previews.
   * Prefer media[0] as the main image/video when adding new nodes.
   */
  imageUrl?: string;
  /** Ordered media list; first item is the main image/video, later items are supporting media. */
  media?: NodeMedia[];
  /** Stored as YYYY-MM (month precision) or YYYY-MM-DD (legacy) */
  dateStart?: string;
  dateEnd?: string;
  status: NodeStatus;
  parentIds: string[];
  category?: NodeCategory;
  /** Manual timeline row hint used by edit-mode drag/drop — lower = higher on the canvas. */
  rowHint?: number;
}

export interface ProjectTree {
  id: string;
  name: string;
  description?: string;
}

export const STATUS_COLORS: Record<NodeStatus, string> = {
  completed: '#06b6d4',
  active: '#a855f7',
  planned: '#f59e0b',
  future: '#64748b',
};

export const STATUS_LABELS: Record<NodeStatus, string> = {
  completed: 'Completed',
  active: 'Active',
  planned: 'Planned',
  future: 'Future',
};

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  software: '#818cf8',  // indigo
  hardware: '#fb923c',  // orange
  mixed:    '#34d399',  // emerald
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  software: 'SW',
  hardware: 'HW',
  mixed:    'SW/HW',
};

export const CATEGORY_CYCLE: Array<NodeCategory | undefined> = [
  undefined, 'software', 'hardware', 'mixed',
];
