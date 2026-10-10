/* =========================================================================
   GraphCanvas.tsx — React wrapper around the Graph3D renderer.
   Owns pointer interactions (orbit / pan / zoom / hover / select),
   resize handling, and exposes an imperative handle for expand,
   collapse, focus, illumination and replay-driven highlighting.

   Interactions: drag = orbit, shift-drag / right-drag = pan,
   wheel = zoom, click = select, double-click = expand group.
   ========================================================================= */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Graph3D } from '../../memory/graph3d';
import type { GraphEdge, GraphNode } from '../../memory/types';

export interface GraphCanvasHandle {
  setGraph(nodes: GraphNode[], edges: GraphEdge[], preservePositions?: boolean): void;
  mergeExpand(res: { nodes: GraphNode[]; edges: GraphEdge[] }): void;
  collapseBranch(nodeId: string): void;
  setSelected(id: string | null): void;
  focusNode(id: string): void;
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetOrbit(): void;
  toggleLabels(): boolean;
  resize(): void;
  illuminate(evt: { event_type: string; node_id?: string | null; edge_id?: string | null }): void;
  highlightPath(nodeIds: string[], edgeIds: string[]): void;
  clearHighlights(): void;
  clearPulses(): void;
}

interface Props {
  onSelectNode: (id: string | null) => void;
  onExpandNode: (id: string) => void;
  onHoverNode?: (id: string | null) => void;
}

const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(
  { onSelectNode, onExpandNode, onHoverNode }, ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g3Ref = useRef<Graph3D | null>(null);
  // Latest handlers kept in refs so the one-time listener setup never goes stale.
  const handlers = useRef({ onSelectNode, onExpandNode, onHoverNode });
  handlers.current = { onSelectNode, onExpandNode, onHoverNode };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g3 = new Graph3D(canvas);
    g3Ref.current = g3;
    g3.resize();
    const ro = new ResizeObserver(() => g3.resize());
    ro.observe(canvas);

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const drag = { mode: null as null | 'orbit' | 'pan', x: 0, y: 0, moved: false };
    let lastClick = { id: null as string | null, t: 0 };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      drag.mode = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
      drag.x = p.x; drag.y = p.y; drag.moved = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = pos(e);
      if (drag.mode) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        if (drag.moved) {
          if (drag.mode === 'orbit') g3.rotateBy(dx, dy); else g3.panBy(dx, dy);
        }
        drag.x = p.x; drag.y = p.y;
      } else {
        const hit = g3.hitTest(p.x, p.y);
        g3.setHover(hit);
        handlers.current.onHoverNode?.(hit);
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const p = pos(e);
      const wasDrag = drag.moved;
      drag.mode = null;
      if (wasDrag) return;
      const hit = g3.hitTest(p.x, p.y);
      const now = Date.now();
      const isDouble = hit !== null && lastClick.id === hit && now - lastClick.t < 380;
      lastClick = { id: hit, t: now };
      g3.setSelected(hit);
      handlers.current.onSelectNode(hit);
      if (hit && isDouble) handlers.current.onExpandNode(hit);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      g3.zoomBy(e.deltaY > 0 ? 1.12 : 0.89);
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    return () => {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    setGraph: (n, e, p = true) => g3Ref.current?.setGraph(n, e, p),
    mergeExpand: (res) => g3Ref.current?.mergeExpand(res),
    collapseBranch: (id) => g3Ref.current?.collapseBranch(id),
    setSelected: (id) => g3Ref.current?.setSelected(id),
    focusNode: (id) => g3Ref.current?.focusNode(id),
    fit: () => g3Ref.current?.fitToView(),
    zoomIn: () => g3Ref.current?.zoomIn(),
    zoomOut: () => g3Ref.current?.zoomOut(),
    resetOrbit: () => g3Ref.current?.resetOrbit(),
    toggleLabels: () => g3Ref.current?.toggleLabels() ?? true,
    resize: () => g3Ref.current?.resize(),
    illuminate: (evt) => g3Ref.current?.illuminate(evt as Parameters<Graph3D['illuminate']>[0]),
    highlightPath: (n, e) => g3Ref.current?.highlightPath(n, e),
    clearHighlights: () => g3Ref.current?.highlightPath([], []),
    clearPulses: () => g3Ref.current?.clearPulses(),
  }), []);

  return (
    <canvas
      ref={canvasRef}
      className="mem-graph-canvas"
      aria-label="3D memory graph canvas"
    />
  );
});

export default GraphCanvas;
