/* =========================================================================
   graph3d.ts — a small, dependency-free 3D graph renderer for HTML canvas.

   Why hand-rolled: the existing frontend has zero graph dependencies and the
   brief requires rotation/pan/zoom/selection/expansion with stable layout.
   A perspective-projected painter renderer (~400 lines) satisfies every
   interaction without pulling three.js into a light Stratify app.

   - Deterministic layout (seeded by node id) so the graph looks the same
     after reload; children cluster around their parents.
   - Camera: yaw/pitch orbit + pan + distance zoom + fit-to-view.
   - Illumination: pulses are ONLY drawn for real execution events pushed
     in via illuminate(); nothing here animates on timers.
   ========================================================================= */
import type { ExecutionEvent, GraphEdge, GraphNode, NodeType } from './types';
import { NODE_COLORS } from './types';

export interface Vec3 { x: number; y: number; z: number; }

interface LaidNode {
  node: GraphNode;
  pos: Vec3;
  radius: number;
  seed: number;
}

interface Pulse {
  t0: number;
  color: string;
  kind: 'node' | 'edge';
}

export const PULSE_MS = 4200;

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Deterministic layered layout: depth via containment, golden-angle rings. */
export function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Vec3> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const e of edges) {
    if ((e.edge_type === 'CONTAINS' || e.edge_type === 'BELONGS_TO') &&
        byId.has(e.source_id) && byId.has(e.target_id)) {
      // CONTAINS: source has children; BELONGS_TO: target is the parent
      const parent = e.edge_type === 'CONTAINS' ? e.source_id : e.target_id;
      const child = e.edge_type === 'CONTAINS' ? e.target_id : e.source_id;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(child);
      parentOf.set(child, parent);
    }
  }

  const depthOf = new Map<string, number>();
  const roots = nodes.filter((n) => !parentOf.has(n.id));
  const queue = roots.map((n) => [n.id, 0] as [string, number]);
  while (queue.length) {
    const [id, d] = queue.shift()!;
    if (depthOf.has(id)) continue;
    depthOf.set(id, d);
    for (const c of childrenOf.get(id) ?? []) if (!depthOf.has(c)) queue.push([c, d + 1]);
  }
  for (const n of nodes) if (!depthOf.has(n.id)) depthOf.set(n.id, depthFallback(n.node_type));

  const pos = new Map<string, Vec3>();
  // roots on an outer ring; each level spirals inward and downward
  const levelBuckets = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depthOf.get(n.id) ?? 4;
    if (!levelBuckets.has(d)) levelBuckets.set(d, []);
    levelBuckets.get(d)!.push(n.id);
  }
  for (const [d, ids] of levelBuckets) {
    const radius = d === 0 ? 60 + Math.min(40, ids.length) : Math.max(26, 78 - d * 14);
    ids.forEach((id, i) => {

      const parent = parentOf.get(id);
      if (parent && pos.has(parent)) {
        // cluster around the parent in a shallow bowl
        const p = pos.get(parent)!;
        const siblings = (childrenOf.get(parent) ?? []).length || 1;
        const ringR = 16 + 7 * Math.sqrt(siblings);
        const ang = hashSeed(id) * Math.PI * 2 + i * 2.399963; // golden angle
        const yy = p.y - 16 - d * 4 + 6 * Math.sin(ang * 3 + hashSeed(parent));
        pos.set(id, {
          x: p.x + ringR * Math.cos(ang),
          y: yy,
          z: p.z + ringR * Math.sin(ang),
        });
      } else {
        const ang = (i / Math.max(1, ids.length)) * Math.PI * 2 + hashSeed(id);
        const jitter = (hashSeed(id + 'y') - 0.5) * 14;
        pos.set(id, {
          x: radius * Math.cos(ang),
          y: -d * 22 + jitter,
          z: radius * Math.sin(ang),
        });
      }
    });
  }
  return pos;
}

function depthFallback(t: NodeType): number {
  switch (t) {
    case 'project': case 'category': return 0;
    case 'skill': case 'workflow': return 1;
    case 'tool': case 'verification_rule': return 2;
    case 'task': return 2;
    case 'execution_step': case 'document': case 'knowledge': case 'source': return 3;
    default: return 3;
  }
}

export function nodeRadius(n: GraphNode): number {
  const base: Partial<Record<NodeType, number>> = {
    project: 8.5, category: 7.5, skill: 6.5, task: 6, workflow: 5.5, tool: 4.5,
  };
  const b = base[n.node_type] ?? 3.6;
  const compressed = n.child_count > 0 ? 1.15 + Math.min(1.1, n.child_count / 40) : 1;
  return b * compressed * (0.85 + n.importance * 0.5);
}

interface Camera {
  yaw: number;
  pitch: number;
  dist: number;
  pan: Vec3;
}

export interface RenderState {
  nodes: Map<string, LaidNode>;
  edges: GraphEdge[];
  cam: Camera;
  selectedId: string | null;
  hoverId: string | null;
  pulses: Map<string, Pulse>;       // node_id -> pulse
  edgePulses: Map<string, Pulse>;   // edge_id -> pulse
  activePathNodes: Set<string>;     // dependency-path highlight
  activePathEdges: Set<string>;
  dimOthers: boolean;
  showLabels: boolean;
  projectFilter: string | null;
}

const TYPE_ORDER: NodeType[] = [
  'project', 'category', 'workflow', 'skill', 'tool', 'verification_rule',
  'task', 'execution_step', 'document', 'knowledge', 'experience', 'failure',
  'recovery', 'memory_summary', 'source',
];

export class Graph3D {
  state: RenderState;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenPos = new Map<string, { x: number; y: number; r: number; z: number }>();
  private raf = 0;
  private needsRender = true;
  private width = 0;
  private height = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.state = {
      nodes: new Map(),
      edges: [],
      cam: { yaw: 0.6, pitch: 0.42, dist: 260, pan: { x: 0, y: 0, z: 0 } },
      selectedId: null,
      hoverId: null,
      pulses: new Map(),
      edgePulses: new Map(),
      activePathNodes: new Set(),
      activePathEdges: new Set(),
      dimOthers: false,
      showLabels: true,
      projectFilter: null,
    };
  }

  /** Replace the full node set (overview load, expansion merge, collapse). */
  setGraph(nodes: GraphNode[], edges: GraphEdge[], preservePositions = true) {
    const prev = preservePositions ? this.state.nodes : new Map<string, LaidNode>();
    const layout = computeLayout(nodes, edges);
    const next = new Map<string, LaidNode>();
    for (const n of nodes) {
      const old = prev.get(n.id);
      const p = (old && preservePositions ? old.pos : layout.get(n.id)) ?? { x: 0, y: 0, z: 0 };
      next.set(n.id, { node: n, pos: p, radius: nodeRadius(n), seed: hashSeed(n.id) });
    }
    this.state.nodes = next;
    this.state.edges = edges;
    this.requestRender();
  }

  /** Merge an expansion response into the current view. */
  mergeExpand(res: { nodes: GraphNode[]; edges: GraphEdge[] }) {
    const nodeMap = new Map<string, GraphNode>();
    for (const ln of this.state.nodes.values()) nodeMap.set(ln.node.id, ln.node);
    for (const n of res.nodes) nodeMap.set(n.id, n);
    const edgeMap = new Map<string, GraphEdge>();
    for (const e of this.state.edges) edgeMap.set(e.id, e);
    for (const e of res.edges) edgeMap.set(e.id, e);
    const nodes = [...nodeMap.values()].sort(
      (a, b) => TYPE_ORDER.indexOf(a.node_type) - TYPE_ORDER.indexOf(b.node_type));
    this.setGraph(nodes, [...edgeMap.values()]);
  }

  /** Remove children of a collapsed group from the view (visual-only). */
  collapseBranch(nodeId: string) {
    const toDrop = new Set<string>();
    const stack = [nodeId];
    const parentOf = new Map<string, string>();
    for (const e of this.state.edges) {
      if (e.edge_type === 'CONTAINS') parentOf.set(e.target_id, e.source_id);
      if (e.edge_type === 'BELONGS_TO') parentOf.set(e.source_id, e.target_id);
    }
    while (stack.length) {
      const cur = stack.pop()!;
      for (const [id, p] of parentOf) {
        if (p === cur && !toDrop.has(id)) { toDrop.add(id); stack.push(id); }
      }
    }
    toDrop.delete(nodeId);
    const nodes = [...this.state.nodes.values()]
      .map((l) => l.node).filter((n) => !toDrop.has(n.id));
    const dropIds = new Set(toDrop);
    const edges = this.state.edges.filter((e) =>
      !dropIds.has(e.source_id) && !dropIds.has(e.target_id));
    this.setGraph(nodes, edges);
  }

  setSelected(id: string | null) { this.state.selectedId = id; this.requestRender(); }
  setHover(id: string | null) { if (this.state.hoverId !== id) { this.state.hoverId = id; this.requestRender(); } }

  illuminate(evt: ExecutionEvent) {
    const now = performance.now();
    const color = eventColor(evt.event_type);
    if (evt.node_id && this.state.nodes.has(evt.node_id)) {
      this.state.pulses.set(evt.node_id, { t0: now, color, kind: 'node' });
    }
    if (evt.edge_id) this.state.edgePulses.set(evt.edge_id, { t0: now, color, kind: 'edge' });
    this.requestRender();
  }

  clearPulses() {
    this.state.pulses.clear();
    this.state.edgePulses.clear();
    this.requestRender();
  }

  highlightPath(nodeIds: string[], edgeIds: string[]) {
    this.state.activePathNodes = new Set(nodeIds);
    this.state.activePathEdges = new Set(edgeIds);
    this.state.dimOthers = nodeIds.length > 0;
    this.requestRender();
  }

  rotateBy(dx: number, dy: number) {
    const cam = this.state.cam;
    cam.yaw += dx * 0.008;
    cam.pitch = Math.max(-1.35, Math.min(1.35, cam.pitch + dy * 0.006));
    this.requestRender();
  }

  panBy(dx: number, dy: number) {
    const cam = this.state.cam;
    const s = cam.dist * 0.0016;
    const cos = Math.cos(cam.yaw), sin = Math.sin(cam.yaw);
    cam.pan.x += (-dx * cos + dy * sin) * s * 8;
    cam.pan.z += (dx * sin + dy * cos) * s * 8;
    this.requestRender();
  }

  zoomBy(factor: number) {
    const cam = this.state.cam;
    cam.dist = Math.max(70, Math.min(900, cam.dist * factor));
    this.requestRender();
  }

  zoomIn() {
    this.zoomBy(0.82);
  }

  zoomOut() {
    this.zoomBy(1.22);
  }

  resetOrbit() {
    this.state.cam.yaw = 0.6;
    this.state.cam.pitch = 0.42;
    this.state.cam.dist = 260;
    this.state.cam.pan = { x: 0, y: 0, z: 0 };
    this.requestRender();
  }

  toggleLabels(): boolean {
    this.state.showLabels = !this.state.showLabels;
    this.requestRender();
    return this.state.showLabels;
  }

  getShowLabels(): boolean {
    return this.state.showLabels;
  }

  fitToView() {
    let maxY = 0;
    for (const ln of this.state.nodes.values()) {
      maxY = Math.max(maxY, Math.abs(ln.pos.x), Math.abs(ln.pos.y), Math.abs(ln.pos.z));
    }
    this.state.cam.dist = Math.max(120, maxY * 2.6 + 90);
    this.state.cam.pan = { x: 0, y: 0, z: 0 };
    this.state.cam.pitch = 0.42;
    this.requestRender();
  }

  /** Bring a node to the center of the camera target. */
  focusNode(nodeId: string) {
    const ln = this.state.nodes.get(nodeId);
    if (!ln) return;
    this.state.cam.pan = { x: ln.pos.x, y: ln.pos.y, z: ln.pos.z };
    this.requestRender();
  }

  hitTest(px: number, py: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [id, sp] of this.screenPos) {
      const d = Math.hypot(sp.x - px, sp.y - py);
      if (d < Math.max(10, sp.r + 6) && d < bestDist) { bestDist = d; best = id; }
    }
    return best;
  }

  requestRender() {
    this.needsRender = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.requestRender();
  }

  private frame() {
    this.raf = 0;
    const hasPulses = this.state.pulses.size > 0 || this.state.edgePulses.size > 0;
    if (this.needsRender || hasPulses) {
      this.draw();
      this.needsRender = false;
      if (hasPulses) this.raf = requestAnimationFrame(() => this.frame());
    }
  }

  private project(p: Vec3): { x: number; y: number; z: number; scale: number } {
    const cam = this.state.cam;
    const rel = { x: p.x - cam.pan.x, y: p.y - cam.pan.y, z: p.z - cam.pan.z };
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = rel.x * cy - rel.z * sy;
    const z1 = rel.x * sy + rel.z * cy;
    const y2 = rel.y * cp - z1 * sp;
    const z2 = rel.y * sp + z1 * cp;
    const zc = z2 + cam.dist;
    const fov = 420;
    const scale = fov / Math.max(24, zc);
    return {
      x: this.width / 2 + x1 * scale,
      y: this.height / 2 - y2 * scale,
      z: zc,
      scale,
    };
  }

  private draw() {
    const { ctx } = this;
    const st = this.state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Deep futuristic cyber-space backdrop with layered vignette
    const g = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 20,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.72
    );
    g.addColorStop(0, '#0e172a');
    g.addColorStop(0.45, '#090e1c');
    g.addColorStop(1, '#040711');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle celestial starfield (deterministic, no flicker)
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const sx = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1 * this.width;
      const sy = ((Math.cos(i * 269.5) * 43758.5453) % 1 + 1) % 1 * this.height;
      const sa = 0.12 + ((i % 5) * 0.08);
      const sr = 0.7 + (i % 3) * 0.5;
      ctx.fillStyle = `rgba(186, 230, 253, ${sa})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3D Ground Perspective Horizon Grid (y = -45)
    ctx.save();
    const groundY = -45;
    const drawGroundRing = (r: number, color: string, dash: number[] = []) => {
      ctx.beginPath();
      const segments = 56;
      for (let i = 0; i <= segments; i++) {
        const th = (i / segments) * Math.PI * 2;
        const pt = this.project({ x: r * Math.cos(th), y: groundY, z: r * Math.sin(th) });
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Concentric perspective rings
    drawGroundRing(160, 'rgba(56, 189, 248, 0.08)');
    drawGroundRing(105, 'rgba(99, 102, 241, 0.14)', [4, 6]);
    drawGroundRing(55, 'rgba(56, 189, 248, 0.18)');

    // Ground axes
    const pX1 = this.project({ x: -160, y: groundY, z: 0 });
    const pX2 = this.project({ x: 160, y: groundY, z: 0 });
    const pZ1 = this.project({ x: 0, y: groundY, z: -160 });
    const pZ2 = this.project({ x: 0, y: groundY, z: 160 });
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pX1.x, pX1.y); ctx.lineTo(pX2.x, pX2.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pZ1.x, pZ1.y); ctx.lineTo(pZ2.x, pZ2.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const now = performance.now();
    // expire pulses
    for (const [id, p] of st.pulses) if (now - p.t0 > PULSE_MS) st.pulses.delete(id);
    for (const [id, p] of st.edgePulses) if (now - p.t0 > PULSE_MS) st.edgePulses.delete(id);

    // project + painter-sort
    this.screenPos.clear();
    const laid = [...st.nodes.values()];
    const proj = laid.map((ln) => {
      const sp = this.project(ln.pos);
      const r = Math.max(2, ln.radius * sp.scale * 0.16);
      this.screenPos.set(ln.node.id, { x: sp.x, y: sp.y, r, z: sp.z });
      return { ln, sp, r };
    }).sort((a, b) => b.sp.z - a.sp.z);

    // edges first
    for (const e of st.edges) {
      const a = this.screenPos.get(e.source_id);
      const b = this.screenPos.get(e.target_id);
      if (!a || !b) continue;
      const puls = st.edgePulses.get(e.id);
      const onPath = st.activePathEdges.has(e.id);
      const isSel = st.selectedId === e.source_id || st.selectedId === e.target_id;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      if (puls || onPath) {
        ctx.strokeStyle = puls ? puls.color : '#a78bfa';
        ctx.shadowColor = puls ? puls.color : '#a78bfa';
        ctx.shadowBlur = 10;
        ctx.globalAlpha = puls ? 0.98 : 0.88;
        ctx.lineWidth = puls ? 2.6 : 2.0;
      } else if (isSel) {
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.6;
      } else {
        ctx.shadowBlur = 0;
        const inferred = e.provenance === 'INFERRED';
        // Palette tint by relationship type
        let edgeColor = 'rgba(148, 163, 184, 0.45)';
        if (e.edge_type === 'REQUIRES') edgeColor = 'rgba(167, 139, 250, 0.55)';
        else if (e.edge_type === 'CONTAINS') edgeColor = 'rgba(56, 189, 248, 0.45)';
        else if (e.edge_type === 'BELONGS_TO') edgeColor = 'rgba(96, 165, 250, 0.45)';
        else if (e.edge_type === 'CALLS' || e.edge_type === 'USES_SKILL') edgeColor = 'rgba(52, 211, 153, 0.55)';

        ctx.strokeStyle = edgeColor;
        ctx.globalAlpha = inferred ? 0.28 : 0.48;
        ctx.lineWidth = 1.1;
        ctx.setLineDash(inferred ? [4, 4] : []);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // nodes
    for (const { ln, sp, r } of proj) {
      const n = ln.node;
      const puls = st.pulses.get(n.id);
      const isSel = st.selectedId === n.id;
      const isHover = st.hoverId === n.id;
      const onPath = st.activePathNodes.has(n.id);
      const dimmed = st.dimOthers && !onPath && !isSel && !puls;
      const color = NODE_COLORS[n.node_type] ?? '#94a3b8';
      const cx = sp.x, cy = sp.y;

      // pulse halo (event illumination)
      if (puls) {
        const t = (now - puls.t0) / PULSE_MS;
        const rr = r + 4 + t * 28;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = puls.color;
        ctx.shadowColor = puls.color;
        ctx.shadowBlur = 16;
        ctx.globalAlpha = Math.max(0, 0.88 * (1 - t));
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // Neon node body fill with bloom
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      grad.addColorStop(0, lighten(color, 0.45));
      grad.addColorStop(0.7, color);
      grad.addColorStop(1, lighten(color, -0.2));
      ctx.fillStyle = grad;
      ctx.shadowColor = color;
      ctx.shadowBlur = isSel ? 22 : isHover ? 16 : (n.child_count > 0 ? 12 : 7);
      ctx.globalAlpha = dimmed ? 0.14 : 1;
      ctx.fill();

      if (n.compression_state === 'ARCHIVED') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.fill();
      }
      ctx.restore();

      // Rings: selection / hover / compressed group
      if (isSel || isHover || onPath) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + (isSel ? 5.5 : 3.5), 0, Math.PI * 2);
        ctx.strokeStyle = isSel ? '#38bdf8' : onPath ? '#c084fc' : 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = isSel ? 2.4 : 1.4;
        ctx.shadowColor = isSel ? '#38bdf8' : '#c084fc';
        ctx.shadowBlur = isSel ? 14 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Extra targeting outer reticle for selected
        if (isSel) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Planetary orbital ring for cluster roots
      if (n.child_count > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3.2, -Math.PI / 2.5, Math.PI / 2.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Labels: Sleek frosted glass badges with category border
      if (st.showLabels && (r > 3.4 || isSel || isHover || puls)) {
        const label = n.child_count > 0 ? `${n.label} (${n.child_count})` : n.label;
        const fs = Math.max(10, Math.min(13, r + 6));
        ctx.font = `${isSel ? 600 : 500} ${fs}px 'Inter', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const ty = cy + r + fs + 4;
        const w = ctx.measureText(label).width;

        ctx.save();
        if (dimmed) ctx.globalAlpha = 0.2;
        // Background badge
        ctx.fillStyle = isSel ? 'rgba(15, 23, 42, 0.92)' : 'rgba(11, 18, 33, 0.78)';
        ctx.strokeStyle = isSel ? '#38bdf8' : `rgba(${parseInt(color.slice(1,3),16)}, ${parseInt(color.slice(3,5),16)}, ${parseInt(color.slice(5,7),16)}, 0.4)`;
        ctx.lineWidth = 1;
        roundRect(ctx, cx - w / 2 - 6, ty - fs + 1, w + 12, fs + 6, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = dimmed ? 'rgba(148, 163, 184, 0.4)' : isSel ? '#ffffff' : '#e2e8f0';
        ctx.fillText(label, cx, ty + 3);
        ctx.restore();
      }
    }
  }

  nodeScreenPos(id: string): { x: number; y: number } | null {
    const sp = this.screenPos.get(id);
    return sp ? { x: sp.x, y: sp.y } : null;
  }
}

function eventColor(t: ExecutionEvent['event_type']): string {
  switch (t) {
    case 'TASK_FAILED': case 'VERIFICATION_FAILED': return '#ef4444';
    case 'TASK_COMPLETED': case 'VERIFICATION_PASSED': return '#10b981';
    case 'TOOL_STARTED': case 'RECOVERY_STARTED': case 'RETRY_SCHEDULED': return '#f59e0b';
    case 'SKILL_RETRIEVED': return '#a78bfa';
    case 'KNOWLEDGE_RETRIEVED': return '#2dd4bf';
    case 'TASK_BLOCKED': return '#fb923c';
    default: return '#38bdf8';
  }
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amt));
  const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amt));
  const b = Math.min(255, (n & 255) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
