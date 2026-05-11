import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ProjectNode, ProjectTree } from '../types';
import { seedTrees, seedNodes } from '../data/seedData';

interface Store {
  trees: ProjectTree[];
  nodes: ProjectNode[];
  seeded: boolean;

  adminAuthed: boolean;
  setAdminAuthed: (v: boolean) => void;

  addTree: (tree: Omit<ProjectTree, 'id'>) => string;
  updateTree: (id: string, updates: Partial<Omit<ProjectTree, 'id'>>) => void;
  deleteTree: (id: string) => void;

  addNode: (node: Omit<ProjectNode, 'id'>) => string;
  updateNode: (id: string, updates: Partial<Omit<ProjectNode, 'id'>>) => void;
  deleteNode: (id: string) => void;

  getNodesForTree: (treeId: string) => ProjectNode[];
  getActiveTreeIds: () => string[];
  resetToSeed: () => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      trees: seedTrees,
      nodes: seedNodes,
      seeded: true,

      adminAuthed: false,
      setAdminAuthed: (v) => set({ adminAuthed: v }),

      addTree: (tree) => {
        const id = uuidv4();
        set((s) => ({ trees: [...s.trees, { ...tree, id }] }));
        return id;
      },
      updateTree: (id, updates) =>
        set((s) => ({ trees: s.trees.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
      deleteTree: (id) =>
        set((s) => ({
          trees: s.trees.filter((t) => t.id !== id),
          nodes: s.nodes.filter((n) => n.treeId !== id),
        })),

      // Auto-assigns treeId: inherits from parent, or creates a self-named cluster
      addNode: (nodeData) => {
        const id = uuidv4();
        const { nodes, trees } = get();

        let treeId = nodeData.treeId;
        if (!treeId || !trees.some((t) => t.id === treeId)) {
          if (nodeData.parentIds && nodeData.parentIds.length > 0) {
            const parent = nodes.find((n) => nodeData.parentIds!.includes(n.id));
            treeId = parent?.treeId ?? id;
          } else {
            treeId = id;
          }
        }

        const newNode: ProjectNode = { ...nodeData, id, treeId } as ProjectNode;

        // Auto-create a tree entry if none exists
        if (!trees.some((t) => t.id === treeId)) {
          const autoTree: ProjectTree = { id: treeId, name: nodeData.title || 'New Project' };
          set((s) => ({ trees: [...s.trees, autoTree], nodes: [...s.nodes, newNode] }));
        } else {
          set((s) => ({ nodes: [...s.nodes, newNode] }));
        }
        return id;
      },

      updateNode: (id, updates) => {
        set((s) => {
          let newNodes = s.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));

          // Merge trees if connecting nodes across clusters
          if (updates.parentIds !== undefined) {
            const updated = newNodes.find((n) => n.id === id)!;
            const nodeMap = new Map(newNodes.map((n) => [n.id, n]));
            for (const pid of updated.parentIds) {
              const parent = nodeMap.get(pid);
              if (!parent || parent.treeId === updated.treeId) continue;
              const oldTid = updated.treeId;
              const targetTid = parent.treeId;
              newNodes = newNodes.map((n) =>
                n.treeId === oldTid ? { ...n, treeId: targetTid } : n,
              );
              break;
            }
          }

          // Remove trees that no longer have any nodes
          const usedIds = new Set(newNodes.map((n) => n.treeId));
          const newTrees = s.trees.filter((t) => usedIds.has(t.id));
          return { nodes: newNodes, trees: newTrees };
        });
      },

      deleteNode: (id) =>
        set((s) => {
          const newNodes = s.nodes
            .filter((n) => n.id !== id)
            .map((n) => ({ ...n, parentIds: n.parentIds.filter((pid) => pid !== id) }));
          const usedIds = new Set(newNodes.map((n) => n.treeId));
          return { nodes: newNodes, trees: s.trees.filter((t) => usedIds.has(t.id)) };
        }),

      getNodesForTree: (treeId) => get().nodes.filter((n) => n.treeId === treeId),
      getActiveTreeIds: () => {
        const { trees, nodes } = get();
        const active = new Set(
          nodes.filter((n) => n.status === 'active' || n.status === 'planned').map((n) => n.treeId),
        );
        return trees.filter((t) => active.has(t.id)).map((t) => t.id);
      },
      resetToSeed: () => set({ trees: seedTrees, nodes: seedNodes, seeded: true }),
    }),
    {
      name: 'project-evolution-data',
      partialize: (s) => ({ trees: s.trees, nodes: s.nodes, seeded: s.seeded }),
    },
  ),
);
