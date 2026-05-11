import { ProjectNode, ProjectTree } from '../types';

export const seedTrees: ProjectTree[] = [
  {
    id: 'tree-flywheel',
    name: 'Superconducting Flywheel',
    description:
      'A progression from basic rotational mechanics to a superconducting flywheel energy storage system.',
  },
  {
    id: 'tree-habitat',
    name: 'Space Habitat Structures',
    description:
      'Structural and sealing knowledge toward a full-scale habitat panel demonstrator.',
  },
];

export const seedNodes: ProjectNode[] = [
  // ── Superconducting Flywheel ──────────────────────────────────────────────
  {
    id: 'fw-1',
    treeId: 'tree-flywheel',
    title: 'Simple Desktop Flywheel',
    status: 'completed',
    dateStart: '2023-09',
    dateEnd: '2023-11',
    parentIds: [],
    category: 'hardware',
    description:
      'Built a small flywheel from aluminum on a hobby lathe to develop intuition for rotor dynamics, balancing, and basic bearing selection.',
  },
  {
    id: 'fw-2',
    treeId: 'tree-flywheel',
    title: 'Larger Flywheel Test Rig',
    status: 'completed',
    dateStart: '2024-01',
    dateEnd: '2024-04',
    parentIds: ['fw-1'],
    category: 'hardware',
    description:
      'Scaled up rotor mass and RPM. Added encoder feedback, studied vibration modes, and characterized bearing losses at higher speeds.',
  },
  {
    id: 'fw-3',
    treeId: 'tree-flywheel',
    title: 'BLDC Motor Control Study',
    status: 'completed',
    dateStart: '2024-02',
    dateEnd: '2024-05',
    parentIds: ['fw-1'],
    category: 'mixed',
    description:
      'Implemented field-oriented control on an STM32 to drive a brushless motor. Tuned current and velocity loops; characterized efficiency vs. speed.',
  },
  {
    id: 'fw-4',
    treeId: 'tree-flywheel',
    title: 'Magnetic Bearing Demo',
    status: 'active',
    dateStart: '2024-06',
    parentIds: ['fw-1'],
    category: 'mixed',
    description:
      'Active magnetic bearing using electromagnets and Hall-effect sensors with a real-time PID controller. Goal: stable levitation of a 500 g rotor.',
  },
  {
    id: 'fw-5',
    treeId: 'tree-flywheel',
    title: 'Vacuum Chamber Prototype',
    status: 'planned',
    parentIds: ['fw-2'],
    category: 'hardware',
    description:
      'Design and fabricate a small vacuum vessel around the flywheel to reduce aerodynamic drag losses. Target: < 1 mTorr.',
  },
  {
    id: 'fw-6',
    treeId: 'tree-flywheel',
    title: 'Superconducting Bearing Research',
    status: 'planned',
    parentIds: ['fw-4'],
    category: 'hardware',
    description:
      'Study YBCO bulk superconductor levitation over permanent-magnet arrays. Characterize stiffness and damping at liquid-nitrogen temperature.',
  },
  {
    id: 'fw-7',
    treeId: 'tree-flywheel',
    title: 'Superconducting Flywheel Energy Storage System',
    status: 'future',
    parentIds: ['fw-2', 'fw-3', 'fw-5', 'fw-6'],
    category: 'hardware',
    description:
      'Integrate all sub-systems: BLDC drive, superconducting bearing, vacuum enclosure, and power electronics into a complete energy storage demonstrator.',
  },

  // ── Space Habitat Structures ──────────────────────────────────────────────
  {
    id: 'sh-1',
    treeId: 'tree-habitat',
    title: 'Flat Pressure Panel Coupon',
    status: 'completed',
    dateStart: '2024-01',
    dateEnd: '2024-03',
    parentIds: [],
    category: 'hardware',
    description:
      'Fabricated and burst-tested small flat composite panels with embedded windows. Established baseline layup schedule and failure modes.',
  },
  {
    id: 'sh-2',
    treeId: 'tree-habitat',
    title: 'Gasket & Clamp-Ring Test',
    status: 'completed',
    dateStart: '2024-04',
    dateEnd: '2024-06',
    parentIds: ['sh-1'],
    category: 'hardware',
    description:
      'Designed and tested multiple gasket profiles and aluminum clamp rings for leak-tight joints. Verified with nitrogen pressure-decay tests.',
  },
  {
    id: 'sh-3',
    treeId: 'tree-habitat',
    title: 'Multi-Pane Glazing Stack',
    status: 'active',
    dateStart: '2024-07',
    parentIds: ['sh-2'],
    category: 'hardware',
    description:
      'Building a triple-pane polycarbonate glazing assembly with vacuum inter-pane gap for thermal insulation and impact redundancy.',
  },
  {
    id: 'sh-4',
    treeId: 'tree-habitat',
    title: 'Geodesic Node/Joint Prototype',
    status: 'planned',
    parentIds: ['sh-1'],
    category: 'mixed',
    description:
      'Develop a 3D-printed titanium hub node that accepts strut inserts at geodesic angles. Structural test against combined tension and torsion.',
  },
  {
    id: 'sh-5',
    treeId: 'tree-habitat',
    title: 'Full Habitat Panel Demonstrator',
    status: 'future',
    parentIds: ['sh-3', 'sh-4'],
    category: 'hardware',
    description:
      'Assemble a 1 m² curved habitat panel section: glazed window, composite wall, geodesic skeleton, and sealing hardware in one integrated demonstrator.',
  },
];
