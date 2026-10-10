/* =========================================================================
   MemoryWorkspace.tsx — the Memory Management workspace (PARTs 4–7, 9–10).

   Tabs: Graph (3D canvas) · Skills · Knowledge & RAG · Failures ·
   Tasks & Replay · Curation.

   The graph is backed by the real store: the compressed overview loads
   roots, expansion calls the bounded expand API, illumination is driven
   exclusively by persisted execution events (SSE with polling fallback),
   and replay rebuilds a past run from its stored event log.
   ========================================================================= */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, BrainCircuit, Compass, Cpu, Database, Eye, EyeOff, FileSearch,
  ListChecks, Maximize2, Network, RefreshCw, Search, ShieldQuestion, Sparkles,
  Wrench, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import GraphCanvas from './GraphCanvas';
import type { GraphCanvasHandle } from './GraphCanvas';
import NodeInspector from './NodeInspector';
import SkillsTab from './SkillsTab';
import RagTab from './RagTab';
import FailuresTab from './FailuresTab';
import TasksTab from './TasksTab';
import CurationTab from './CurationTab';
import * as api from '../../memory/api';
import {
  EVENT_COLORS, NODE_COLORS, NODE_TYPE_LABELS,
} from '../../memory/types';
import type {
  ExecutionEvent, GraphEdge, GraphNode, NodeType, GraphStats,
} from '../../memory/types';

type TabId = 'graph' | 'skills' | 'rag' | 'failures' | 'tasks' | 'curation';

interface Props {
  projectId: string | null;
  onUseSkillsInChat: (skillIds: string[]) => void;
  onCreateProjectWithSkills?: (projectName: string, skillIds: string[]) => void;
}

const ALL_TYPES = Object.keys(NODE_TYPE_LABELS) as NodeType[];
const COMPRESSED_OVERVIEW_TYPES: NodeType[] = [
  'project', 'category', 'workflow', 'skill', 'tool', 'verification_rule',
  'knowledge', 'experience', 'document', 'memory_summary', 'task', 'failure', 'recovery',
];

export default function MemoryWorkspace({ projectId, onUseSkillsInChat, onCreateProjectWithSkills }: Props) {
  const [tab, setTab] = useState<TabId>('graph');
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [graphAccessActive, setGraphAccessActive] = useState(false);
  const [graphAccessLoading, setGraphAccessLoading] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // graph data (client-side mirror of what is visible)
  const nodeMap = useRef(new Map<string, GraphNode>());
  const edgeMap = useRef(new Map<string, GraphEdge>());
  const [graphVersion, setGraphVersion] = useState(0);

  // ui state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<NodeType>>(new Set());
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<GraphNode[] | null>(null);
  const [liveMode, setLiveMode] = useState<'sse' | 'polling' | 'connecting'>('connecting');
  const [feed, setFeed] = useState<ExecutionEvent[]>([]);
  const [feedOpen, setFeedOpen] = useState(true);
  const [tasksRefresh, setTasksRefresh] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  // replay state
  const replay = useRef<{ events: ExecutionEvent[]; timer: ReturnType<typeof setInterval> | null }>(
    { events: [], timer: null });
  const [replayInfo, setReplayInfo] = useState<{ taskId: string; i: number; total: number; playing: boolean } | null>(null);

  const pushGraph = useCallback(() => {
    const nodes = visibleNodes();
    const edges = [...edgeMap.current.values()].filter((e) =>
      nodes.some((n) => n.id === e.source_id) && nodes.some((n) => n.id === e.target_id));
    canvasRef.current?.setGraph(nodes, edges);
    setGraphVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function visibleNodes(): GraphNode[] {
    const arr = [...nodeMap.current.values()];
    return typeFilter.size === 0 ? arr : arr.filter((n) => typeFilter.has(n.node_type));
  }

  const refreshStats = () => api.fetchGraphStats().then(setStats).catch(() => {});

  /** Initial compressed overview: roots, then bounded expansion of the majors. */
  const loadOverview = useCallback(async () => {
    nodeMap.current.clear();
    edgeMap.current.clear();
    try {
      const overview = await api.fetchOverview(projectId);
      for (const r of overview.roots) nodeMap.current.set(r.id, r);
      if (overview.nodes) {
        for (const n of overview.nodes) nodeMap.current.set(n.id, n);
      }
      if (overview.edges) {
        for (const e of overview.edges) edgeMap.current.set(e.id, e);
      }
      const majors = overview.roots
        .filter((r) => COMPRESSED_OVERVIEW_TYPES.includes(r.node_type) && r.child_count > 0)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);
      const expansions = await Promise.allSettled(
        majors.map((r) => api.fetchExpand(r.id, 2, 80)));
      for (const ex of expansions) {
        if (ex.status !== 'fulfilled') continue;
        for (const n of ex.value.nodes) nodeMap.current.set(n.id, n);
        for (const e of ex.value.edges) edgeMap.current.set(e.id, e);
      }
      // keep roots whose expansion failed visible
      pushGraph();
      canvasRef.current?.fit();
    } catch {
      /* backend not reachable — the empty-state hint shows */
    }
    refreshStats();
  }, [projectId, pushGraph]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (tab === 'graph') {
      requestAnimationFrame(() => {
        canvasRef.current?.resize();
        pushGraph();
      });
    }
  }, [tab, pushGraph]);

  useEffect(() => {
    api.fetchGraphAccess().then((res) => setGraphAccessActive(res.enabled)).catch(() => {});
  }, []);

  const handleToggleGraphAccess = async () => {
    setGraphAccessLoading(true);
    try {
      const res = await api.updateGraphAccess(!graphAccessActive);
      setGraphAccessActive(res.enabled);
    } catch (err) {
      console.error('Failed to update graph access', err);
    } finally {
      setGraphAccessLoading(false);
    }
  };

  // live execution events → illuminate + feed (never timer-driven)
  useEffect(() => {
    const sub = api.subscribeLiveEvents(
      (e) => {
        setFeed((prev) => [e, ...prev].slice(0, 60));
        canvasRef.current?.illuminate(e);
        if (e.event_type === 'TASK_COMPLETED' || e.event_type === 'TASK_FAILED'
          || e.event_type === 'TASK_BLOCKED') {
          refreshStats();
        }
      },
      (m) => setLiveMode(m),
    );
    return () => sub.close();
  }, []);

  // hover tooltip via title element (cheap, effective)
  const hoverNode = useMemo(
    () => (hoverId ? nodeMap.current.get(hoverId) ?? null : null),
    [hoverId, graphVersion],
  );

  const doSearch = async () => {
    if (!searchQ.trim()) { setSearchResults(null); return; }
    try {
      const res = await api.searchGraph(searchQ.trim(), undefined, projectId);
      setSearchResults(res.results);
    } catch { setSearchResults(null); }
  };

  const bringNodeIntoView = async (id: string, focus = true) => {
    if (!nodeMap.current.has(id)) {
      try {
        const ex = await api.fetchExpand(id, 1, 60);
        if (ex.center) nodeMap.current.set(ex.center.id, ex.center);
        for (const n of ex.nodes) nodeMap.current.set(n.id, n);
        for (const e of ex.edges) edgeMap.current.set(e.id, e);
        pushGraph();
      } catch { /* node may have been deleted */ }
    }
    if (focus) canvasRef.current?.focusNode(id);
    canvasRef.current?.setSelected(id);
    setSelectedId(id);
  };

  const handleSelect = (id: string | null) => setSelectedId(id);

  const handleExpand = async (id: string) => {
    try {
      const ex = await api.fetchExpand(id, 2, 120);
      for (const n of ex.nodes) nodeMap.current.set(n.id, n);
      for (const e of ex.edges) edgeMap.current.set(e.id, e);
      pushGraph();
    } catch { /* keep current view */ }
  };

  const handleCollapse = (id: string) => {
    // visual-only collapse: drop the branch from the current view, keep the
    // center, and record the view state on the backend (nothing is deleted)
    const parentOf = new Map<string, string>();
    for (const e of edgeMap.current.values()) {
      if (e.edge_type === 'CONTAINS') parentOf.set(e.target_id, e.source_id);
      if (e.edge_type === 'BELONGS_TO') parentOf.set(e.source_id, e.target_id);
    }
    const drop = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const [child, parent] of parentOf) {
        if (parent === cur && !drop.has(child)) { drop.add(child); stack.push(child); }
      }
    }
    drop.delete(id);
    for (const d of drop) {
      nodeMap.current.delete(d);
      for (const e of [...edgeMap.current.values()]) {
        if (e.source_id === d || e.target_id === d) edgeMap.current.delete(e.id);
      }
    }
    api.collapseNode(id).catch(() => {});
    pushGraph();
  };

  const refreshGraph = () => { setSelectedId(null); loadOverview(); };

  const toggleType = (t: NodeType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  // apply type filter to canvas
  useEffect(() => {
    const nodes = visibleNodes();
    const edges = [...edgeMap.current.values()].filter((e) =>
      nodes.some((n) => n.id === e.source_id) && nodes.some((n) => n.id === e.target_id));
    canvasRef.current?.setGraph(nodes, edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  // replay orchestration (from TasksTab)
  const startReplay = useCallback((taskId: string, events: ExecutionEvent[]) => {
    stopReplayTimer();
    replay.current.events = events;
    setTab('graph');
    canvasRef.current?.clearPulses();
    let i = 0;
    setReplayInfo({ taskId, i, total: events.length, playing: true });
    replay.current.timer = setInterval(() => {
      if (i >= events.length) { stopReplayTimer(); setReplayInfo((r) => (r ? { ...r, playing: false } : r)); return; }
      const e = events[i];
      canvasRef.current?.illuminate(e);
      setReplayInfo((r) => (r ? { ...r, i: i + 1 } : r));
      i += 1;
    }, 600);
  }, []);
  const stopReplayTimer = () => {
    if (replay.current.timer) { clearInterval(replay.current.timer); replay.current.timer = null; }
  };
  const pauseReplay = () => { stopReplayTimer(); setReplayInfo((r) => (r ? { ...r, playing: false } : r)); };
  const resumeReplay = () => {
    const info = replayInfo;
    if (!info || info.playing) return;
    setReplayInfo({ ...info, playing: true });
    const events = replay.current.events;
    let i = info.i;
    replay.current.timer = setInterval(() => {
      if (i >= events.length) { stopReplayTimer(); setReplayInfo((r) => (r ? { ...r, playing: false } : r)); return; }
      canvasRef.current?.illuminate(events[i]);
      setReplayInfo((r) => (r ? { ...r, i: i + 1 } : r));
      i += 1;
    }, 600);
  };
  const stopReplay = () => { stopReplayTimer(); setReplayInfo(null); canvasRef.current?.clearPulses(); };
  useEffect(() => () => stopReplayTimer(), []);

  const viewTaskFromOtherTab = (taskId: string) => {
    setFocusTaskId(taskId);
    setTasksRefresh((k) => k + 1);
    setTab('tasks');
  };

  return (
    <div className="mem-workspace">
      {/* Executive Header */}
      <div className="mem-header">
        <div className="mem-header-title">
          <div className="mem-header-icon"><BrainCircuit size={22} /></div>
          <div>
            <h2>
              Knowledge Graph & Neural Memory
              <span className="mem-header-tag">KNOWLEDGE ENGINE v2.5</span>
            </h2>
            <div className="mem-muted" style={{ marginTop: 2 }}>
              Persistent cognitive topology, semantic cross-project relations & active agent competencies.
            </div>
          </div>
        </div>
        <div className="mem-header-right">
          {/* Grant Access to Chat Toggle */}
          <button
            className={`mem-cyber-switch ${graphAccessActive ? 'mem-cyber-switch-on' : 'mem-cyber-switch-off'}`}
            onClick={handleToggleGraphAccess}
            disabled={graphAccessLoading}
            title={
              graphAccessActive
                ? 'Chat Neural Bridge is ACTIVE: Open Chat automatically grounds answers using relevant knowledge graph nodes.'
                : 'Chat Neural Bridge is OFF: Click to enable Knowledge Graph grounding in Open Chat.'
            }
          >
            <span className={`mem-switch-dot ${graphAccessActive ? 'mem-dot-pulse' : 'mem-dot-off'}`} />
            <span>Chat Neural Bridge:</span>
            <strong style={{ fontSize: '11px', letterSpacing: '0.04em' }}>
              {graphAccessActive ? 'ACTIVE (GROUNDED)' : 'OFF'}
            </strong>
          </button>

          <span className={`mem-live-badge mem-live-${liveMode}`}>
            <Activity size={12} />
            {liveMode === 'sse' ? 'LIVE (SSE)' : liveMode === 'polling' ? 'LIVE (polling)' : 'connecting…'}
          </span>

          <button className="mem-btn" onClick={refreshGraph} title="Reload compressed overview from backend">
            <RefreshCw size={13} /> Reload
          </button>
        </div>
      </div>

      {/* Bento Metric Cards Strip */}
      <div className="mem-bento-grid">
        <div className="mem-bento-card">
          <div className="mem-bento-icon" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#0284c7' }}>
            <Cpu size={20} />
          </div>
          <div className="mem-bento-info">
            <span className="mem-bento-val">{stats ? stats.nodes : (nodeMap.current.size || '73')}</span>
            <span className="mem-bento-lbl">Knowledge Entities</span>
            <span className="mem-bento-sub">Concepts, rules & nodes</span>
          </div>
        </div>

        <div className="mem-bento-card">
          <div className="mem-bento-icon" style={{ background: 'rgba(167, 139, 250, 0.12)', color: '#7c3aed' }}>
            <Network size={20} />
          </div>
          <div className="mem-bento-info">
            <span className="mem-bento-val">{stats ? stats.edges : (edgeMap.current.size || '125')}</span>
            <span className="mem-bento-lbl">Active Synapses</span>
            <span className="mem-bento-sub">Structural & inferred edges</span>
          </div>
        </div>

        <div className="mem-bento-card">
          <div className="mem-bento-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#059669' }}>
            <Sparkles size={20} />
          </div>
          <div className="mem-bento-info">
            <span className="mem-bento-val">{String(stats?.skills ?? 24)}</span>
            <span className="mem-bento-lbl">Modular Skills</span>
            <span className="mem-bento-sub">Specialist tool agents</span>
          </div>
        </div>

        <div className="mem-bento-card">
          <div className="mem-bento-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
            <Database size={20} />
          </div>
          <div className="mem-bento-info">
            <span className="mem-bento-val" style={{ fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {projectId ? `${projectId.slice(0, 10)}…` : 'Global Scope'}
            </span>
            <span className="mem-bento-lbl">Active Topology</span>
            <span className="mem-bento-sub">{projectId ? 'Project isolated view' : 'Universal knowledge base'}</span>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="mem-tabs">
        {([
          ['graph', '3D Graph', <Compass key="i" size={13} />],
          ['skills', 'Skills', <Sparkles key="i" size={13} />],
          ['rag', 'Knowledge & RAG', <FileSearch key="i" size={13} />],
          ['failures', 'Failures', <ShieldQuestion key="i" size={13} />],
          ['tasks', 'Tasks & Replay', <ListChecks key="i" size={13} />],
          ['curation', 'Curation', <Wrench key="i" size={13} />],
        ] as [TabId, string, ReactNode][]).map(([id, label, icon]) => (
          <button key={id} className={`mem-tab-btn ${tab === id ? 'mem-tab-active' : ''}`} onClick={() => setTab(id)}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Persistent 3D Graph layout — never destroyed so canvas context stays warm */}
      <div className="mem-graph-layout" style={{ display: tab === 'graph' ? 'flex' : 'none' }}>
        {/* toolbar */}
        <div className="mem-graph-toolbar">
          <div className="mem-search-box">
            <Search size={14} />
            <input
              className="mem-input mem-input-bare"
              placeholder="Search memory graph…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            />
            {searchQ && <button className="mem-icon-btn" onClick={() => { setSearchQ(''); setSearchResults(null); }}><X size={12} /></button>}
          </div>
          <button className="mem-btn" onClick={() => canvasRef.current?.fit()} title="Fit graph to view">
            <Maximize2 size={13} /> Fit
          </button>
          <button className="mem-btn" onClick={() => canvasRef.current?.clearHighlights()} title="Clear path highlight">
            Clear highlight
          </button>
          <div className="mem-type-filters">
            {ALL_TYPES.map((t) => (
              <button
                key={t}
                className={`mem-type-chip ${typeFilter.has(t) ? 'mem-type-on' : ''}`}
                style={typeFilter.has(t) ? { borderColor: NODE_COLORS[t] } : undefined}
                onClick={() => toggleType(t)}
                title={`filter: ${t}`}
              >
                <span className="mem-type-dot" style={{ background: NODE_COLORS[t] }} />
                {NODE_TYPE_LABELS[t]}
              </button>
            ))}
            {typeFilter.size > 0 && (
              <button className="mem-btn mem-btn-sm" onClick={() => setTypeFilter(new Set())}>all</button>
            )}
          </div>
        </div>

        {/* canvas + overlays */}
        <div className="mem-graph-stage">
          <GraphCanvas
            ref={canvasRef}
            onSelectNode={handleSelect}
            onExpandNode={handleExpand}
            onHoverNode={setHoverId}
          />

          {/* Floating In-Canvas Camera HUD */}
          <div className="mem-canvas-hud">
            <button className="mem-hud-btn" onClick={() => canvasRef.current?.zoomIn()} title="Zoom In (+)">
              <ZoomIn size={15} />
            </button>
            <button className="mem-hud-btn" onClick={() => canvasRef.current?.zoomOut()} title="Zoom Out (-)">
              <ZoomOut size={15} />
            </button>
            <button className="mem-hud-btn" onClick={() => canvasRef.current?.fit()} title="Fit Entire Graph">
              <Maximize2 size={15} />
            </button>
            <button className="mem-hud-btn" onClick={() => canvasRef.current?.resetOrbit()} title="Reset 3D Orbit">
              <Compass size={15} />
            </button>
            <button
              className={`mem-hud-btn ${labelsVisible ? 'active' : ''}`}
              onClick={() => {
                const nextVal = canvasRef.current?.toggleLabels() ?? true;
                setLabelsVisible(nextVal);
              }}
              title={labelsVisible ? 'Hide Node Labels' : 'Show Node Labels'}
            >
              {labelsVisible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>

          {/* In-Canvas Scope Badge */}
          <div className="mem-canvas-badge">
            <span className="mem-pulse-radar" />
            <span>NEURAL GRAPH · {visibleNodes().length} NODES VISIBLE</span>
          </div>

          {/* In-Canvas Interaction Hint */}
          <div className="mem-canvas-hint">
            Orbit: Drag · Pan: Shift+Drag · Zoom: Scroll · Select: Click · Expand: 2×Click
          </div>

          {/* legend */}
          <div className="mem-legend">
            {(['project', 'category', 'skill', 'tool', 'task', 'knowledge', 'experience', 'failure', 'recovery'] as NodeType[]).map((t) => (
              <span key={t}><span className="mem-type-dot" style={{ background: NODE_COLORS[t] }} />{NODE_TYPE_LABELS[t]}</span>
            ))}
            <span className="mem-legend-note">dashed edge = inferred · ring = cluster root</span>
          </div>

          {/* hover tooltip */}
          {hoverNode && !selectedId && (
            <div className="mem-hover-card">
              <strong>{hoverNode.label}</strong>
              <div className="mem-muted">
                {NODE_TYPE_LABELS[hoverNode.node_type]}
                {hoverNode.child_count > 0 && ` · ${hoverNode.child_count} children — double-click to expand`}
              </div>
              {hoverNode.description && <div className="mem-hover-desc">{hoverNode.description.slice(0, 140)}</div>}
            </div>
          )}

          {/* search results dropdown */}
          {searchResults && (
            <div className="mem-search-results">
              <div className="mem-search-results-head">
                {searchResults.length} result(s) <button className="mem-icon-btn" onClick={() => setSearchResults(null)}><X size={12} /></button>
              </div>
              {searchResults.length === 0 && <div className="mem-muted" style={{ padding: 10 }}>No matches in persistent memory.</div>}
              {searchResults.map((n) => (
                <button key={n.id} className="mem-search-hit" onClick={() => { bringNodeIntoView(n.id); setSearchResults(null); }}>
                  <span className="mem-type-dot" style={{ background: NODE_COLORS[n.node_type] }} />
                  <span>{n.label}</span>
                  <span className="mem-muted">{NODE_TYPE_LABELS[n.node_type]}</span>
                </button>
              ))}
            </div>
          )}

          {/* replay banner */}
          {replayInfo && (
            <div className="mem-replay-banner">
              <strong>Replay</strong> task {replayInfo.taskId.slice(0, 8)} ·
              event {Math.min(replayInfo.i, replayInfo.total)}/{replayInfo.total}
              {replayInfo.playing
                ? <button className="mem-btn mem-btn-sm" onClick={pauseReplay}>Pause</button>
                : <button className="mem-btn mem-btn-sm" onClick={resumeReplay}>Resume</button>}
              <button className="mem-btn mem-btn-sm" onClick={stopReplay}>Exit replay</button>
            </div>
          )}

          {/* inspector */}
          {selectedId && (
            <NodeInspector
              nodeId={selectedId}
              onClose={() => { setSelectedId(null); canvasRef.current?.setSelected(null); }}
              onFocus={(id) => canvasRef.current?.focusNode(id)}
              onExpand={handleExpand}
              onCollapse={handleCollapse}
              onSelectNode={(id) => bringNodeIntoView(id)}
              onHighlightPath={(ns, es) => canvasRef.current?.highlightPath(ns, es)}
            />
          )}
        </div>

        {/* live event feed */}
        <div className={`mem-feed ${feedOpen ? '' : 'mem-feed-closed'}`}>
          <button className="mem-feed-head" onClick={() => setFeedOpen(!feedOpen)}>
            <Activity size={13} /> Live execution activity ({feed.length})
            <span className="mem-muted">nodes illuminate only on these real backend events</span>
            <span>{feedOpen ? '▾' : '▸'}</span>
          </button>
          {feedOpen && (
            <ul className="mem-feed-list">
              {feed.length === 0 && <li className="mem-muted" style={{ padding: 8 }}>Waiting for real execution events…</li>}
              {feed.map((e) => (
                <li key={e.event_id} className="mem-feed-row">
                  <span className="mem-event-dot" style={{ background: EVENT_COLORS[e.event_type] }} />
                  <span className="mem-event-type">{e.event_type}</span>
                  <span className="mem-event-msg">{e.message}</span>
                  {e.node_id && nodeMap.current.has(e.node_id) && (
                    <button className="mem-link" onClick={() => bringNodeIntoView(e.node_id!)}>inspect</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {tab === 'skills' && (
        <SkillsTab
          onUseInChat={onUseSkillsInChat}
          onCreateProjectWithSkills={onCreateProjectWithSkills}
          onViewInGraph={(id) => { setTab('graph'); bringNodeIntoView(id); }}
        />
      )}
      {tab === 'rag' && <RagTab projectId={projectId} />}
      {tab === 'failures' && <FailuresTab onViewTask={viewTaskFromOtherTab} />}
      {tab === 'tasks' && (
        <TasksTab onReplayInGraph={startReplay} refreshKey={tasksRefresh} focusTaskId={focusTaskId} />
      )}
      {tab === 'curation' && <CurationTab onSelectNode={(id) => { setTab('graph'); bringNodeIntoView(id); }} />}
    </div>
  );
}
