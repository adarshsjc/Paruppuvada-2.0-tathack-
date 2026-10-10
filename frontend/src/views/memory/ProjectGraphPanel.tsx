/* =========================================================================
   ProjectGraphPanel.tsx — Project-Scoped Knowledge Graph & Live Analytics.
   Renders inside the right-hand panel of ChatWorkspace, displaying:
   - Project-scoped nodes (project root, skills, memories, task runs)
   - Real-time illumination when complex mode chats run
   - Quick skill node focus & details inspection
   ========================================================================= */
import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Compass, 
  Maximize2, 
  RefreshCw, 
  Search, 
  Sparkles, 
  X, 
  Zap
} from 'lucide-react';
import GraphCanvas from './GraphCanvas';
import type { GraphCanvasHandle } from './GraphCanvas';
import * as api from '../../memory/api';
import { NODE_COLORS, NODE_TYPE_LABELS } from '../../memory/types';
import type { ExecutionEvent, GraphEdge, GraphNode } from '../../memory/types';
import type { TaskState } from '../../types';

interface Props {
  projectId: string | null;
  activeSkills?: string[];
  latestState?: TaskState | null;
}

export default function ProjectGraphPanel({ projectId, activeSkills = [], latestState }: Props) {
  const canvasRef = useRef<GraphCanvasHandle>(null);
  const nodeMap = useRef<Map<string, GraphNode>>(new Map());
  const edgeMap = useRef<Map<string, GraphEdge>>(new Map());

  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [livePulseCount, setLivePulseCount] = useState(0);

  const pushToCanvas = useCallback(() => {
    const nodes = Array.from(nodeMap.current.values());
    const edges = Array.from(edgeMap.current.values()).filter(
      (e) => nodeMap.current.has(e.source_id) && nodeMap.current.has(e.target_id)
    );
    canvasRef.current?.setGraph(nodes, edges);
    setNodeCount(nodes.length);
    setEdgeCount(edges.length);
  }, []);

  const loadProjectGraph = useCallback(async () => {
    setLoading(true);
    nodeMap.current.clear();
    edgeMap.current.clear();

    try {
      // 1. Fetch overview (scoped to project if available)
      const overview = await api.fetchOverview(projectId);
      if (overview.roots) {
        for (const r of overview.roots) nodeMap.current.set(r.id, r);
      }
      if (overview.nodes) {
        for (const n of overview.nodes) nodeMap.current.set(n.id, n);
      }
      if (overview.edges) {
        for (const e of overview.edges) edgeMap.current.set(e.id, e);
      }

      // 2. Expand active skills into the project graph view so user sees tools and rules
      if (activeSkills.length > 0) {
        const expansions = await Promise.allSettled(
          activeSkills.slice(0, 6).map((sId) => api.fetchExpand(sId, 1, 30))
        );
        for (const res of expansions) {
          if (res.status === 'fulfilled') {
            if (res.value.center) nodeMap.current.set(res.value.center.id, res.value.center);
            for (const n of res.value.nodes) nodeMap.current.set(n.id, n);
            for (const e of res.value.edges) edgeMap.current.set(e.id, e);
          }
        }
      }

      // 3. Expand the project root or top majors
      const rootsToExpand = (overview.roots || []).slice(0, 4);
      const rootExpansions = await Promise.allSettled(
        rootsToExpand.map((r) => api.fetchExpand(r.id, 1, 40))
      );
      for (const res of rootExpansions) {
        if (res.status === 'fulfilled') {
          for (const n of res.value.nodes) nodeMap.current.set(n.id, n);
          for (const e of res.value.edges) edgeMap.current.set(e.id, e);
        }
      }

      pushToCanvas();
      setTimeout(() => canvasRef.current?.fit(), 150);
    } catch (e) {
      console.warn('Project graph load warning:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, activeSkills, pushToCanvas]);

  useEffect(() => {
    loadProjectGraph();
  }, [loadProjectGraph]);

  // Live event subscription to illuminate nodes on live chat executions
  useEffect(() => {
    const sub = api.subscribeLiveEvents(
      (e: ExecutionEvent) => {
        canvasRef.current?.illuminate(e);
        setLivePulseCount((c) => c + 1);
        if (e.node_id && !nodeMap.current.has(e.node_id)) {
          // fetch and insert newly created node
          api.fetchNode(e.node_id).then((node) => {
            nodeMap.current.set(node.id, node);
            pushToCanvas();
          }).catch(() => {});
        }
      },
      () => {}
    );
    return () => sub.close();
  }, [pushToCanvas]);

  // When a new complex task arrives, highlight or illuminate active skills
  useEffect(() => {
    if (latestState && activeSkills.length > 0) {
      activeSkills.forEach((skillId) => {
        canvasRef.current?.illuminate({
          event_type: 'SKILL_RESOLVED',
          node_id: skillId,
        });
      });
    }
  }, [latestState, activeSkills]);

  const handleSelectNode = (id: string | null) => {
    if (!id) {
      setSelectedNode(null);
      return;
    }
    const n = nodeMap.current.get(id);
    if (n) {
      setSelectedNode(n);
      canvasRef.current?.focusNode(id);
    } else {
      api.fetchNode(id).then((fetched) => {
        setSelectedNode(fetched);
        nodeMap.current.set(fetched.id, fetched);
        pushToCanvas();
        canvasRef.current?.focusNode(id);
      }).catch(() => setSelectedNode(null));
    }
  };

  const handleExpandNode = async (id: string) => {
    try {
      const ex = await api.fetchExpand(id, 1, 50);
      for (const n of ex.nodes) nodeMap.current.set(n.id, n);
      for (const e of ex.edges) edgeMap.current.set(e.id, e);
      pushToCanvas();
    } catch {}
  };

  const handleHoverNode = (id: string | null) => {
    if (!id) {
      setHoverNode(null);
      return;
    }
    setHoverNode(nodeMap.current.get(id) || null);
  };

  const handleSearchNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    const hit = Array.from(nodeMap.current.values()).find(
      (n) => n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q)
    );
    if (hit) {
      handleSelectNode(hit.id);
    }
  };

  const focusSkill = (skillId: string) => {
    if (nodeMap.current.has(skillId)) {
      handleSelectNode(skillId);
    } else {
      api.fetchExpand(skillId, 1, 30).then((ex) => {
        if (ex.center) nodeMap.current.set(ex.center.id, ex.center);
        for (const n of ex.nodes) nodeMap.current.set(n.id, n);
        for (const e of ex.edges) edgeMap.current.set(e.id, e);
        pushToCanvas();
        handleSelectNode(skillId);
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Top Controls Toolbar */}
      <div style={{
        padding: '8px 14px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Compass size={13} color="#6366f1" />
            Project Knowledge Graph
          </span>
          <span className="mem-chip mem-chip-soft" style={{ fontSize: '10px', padding: '1px 6px' }}>
            {nodeCount} Nodes · {edgeCount} Edges
          </span>
          {livePulseCount > 0 && (
            <span className="mem-chip mem-chip-ok" style={{ fontSize: '9px', padding: '1px 5px' }}>
              <Zap size={9} /> {livePulseCount} Live Pulses
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <form onSubmit={handleSearchNode} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '2px 6px',
            }}>
              <Search size={11} color="#94a3b8" />
              <input
                type="text"
                placeholder="Find node…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '11px',
                  width: '90px',
                }}
              />
            </div>
          </form>

          <button
            className="mem-btn mem-btn-sm"
            onClick={() => canvasRef.current?.fit()}
            title="Fit graph into view"
            style={{ padding: '3px 7px', fontSize: '11px' }}
          >
            <Maximize2 size={11} /> Fit
          </button>
          <button
            className="mem-btn mem-btn-sm"
            onClick={loadProjectGraph}
            title="Reload project graph"
            style={{ padding: '3px 7px', fontSize: '11px' }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Active Skills Strip */}
      {activeSkills.length > 0 && (
        <div style={{
          padding: '6px 14px',
          background: '#f8fafc',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          fontSize: '11px',
        }}>
          <span style={{ color: '#64748b', fontWeight: 600, flexShrink: 0, fontSize: '10px' }}>
            Active Skills:
          </span>
          {activeSkills.map((sId) => (
            <button
              key={sId}
              type="button"
              onClick={() => focusSkill(sId)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: '10px',
                fontWeight: 600,
                background: selectedNode?.id === sId ? '#e0e7ff' : '#ffffff',
                border: selectedNode?.id === sId ? '1px solid #6366f1' : '1px solid #e2e8f0',
                color: selectedNode?.id === sId ? '#4338ca' : '#475569',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              title={`Focus ${sId} in 3D Graph`}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1' }}></span>
              {sId.replace('skill:', '')}
            </button>
          ))}
        </div>
      )}

      {/* 3D Canvas Stage */}
      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: '380px',
        background: 'radial-gradient(circle at 50% 50%, #0f172a 0%, #020617 100%)',
        overflow: 'hidden',
      }}>
        <GraphCanvas
          ref={canvasRef}
          onSelectNode={handleSelectNode}
          onExpandNode={handleExpandNode}
          onHoverNode={handleHoverNode}
        />

        {/* Loading overlay */}
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#c7d2fe',
            fontSize: '12px',
            gap: 8,
          }}>
            <Sparkles size={16} className="animate-spin" />
            <span>Assembling project knowledge graph…</span>
          </div>
        )}

        {/* Hover quick card */}
        {hoverNode && !selectedNode && (
          <div style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            maxWidth: '260px',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f8fafc',
            fontSize: '11px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: NODE_COLORS[hoverNode.node_type] || '#6366f1',
                }}
              />
              {hoverNode.label}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: 2 }}>
              {NODE_TYPE_LABELS[hoverNode.node_type] || hoverNode.node_type}
              {hoverNode.child_count > 0 && ` · ${hoverNode.child_count} children`}
            </div>
          </div>
        )}

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRadius: 10,
            padding: '12px 14px',
            color: '#f8fafc',
            fontSize: '11px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            zIndex: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: NODE_COLORS[selectedNode.node_type] || '#6366f1',
                  }}
                />
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff' }}>
                  {selectedNode.label}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#c7d2fe',
                    fontWeight: 600,
                  }}
                >
                  {NODE_TYPE_LABELS[selectedNode.node_type] || selectedNode.node_type}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedNode(null);
                  canvasRef.current?.setSelected(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <X size={14} />
              </button>
            </div>

            {selectedNode.description && (
              <p style={{ margin: '6px 0 8px', color: '#cbd5e1', fontSize: '11px', lineHeight: 1.4 }}>
                {selectedNode.description}
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="mem-btn mem-btn-sm"
                onClick={() => handleExpandNode(selectedNode.id)}
                style={{ fontSize: '10px', padding: '3px 8px' }}
              >
                Expand Branch ({selectedNode.child_count} children)
              </button>
              <button
                type="button"
                className="mem-btn mem-btn-sm"
                onClick={() => canvasRef.current?.focusNode(selectedNode.id)}
                style={{ fontSize: '10px', padding: '3px 8px' }}
              >
                Center Camera
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
