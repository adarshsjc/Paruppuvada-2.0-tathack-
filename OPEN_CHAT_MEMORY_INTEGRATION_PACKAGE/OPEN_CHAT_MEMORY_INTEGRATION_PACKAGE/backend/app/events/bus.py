"""Execution event bus.

Events are persisted facts. The UI may illuminate a node/edge ONLY when one
of these rows exists — never on a timer. SSE and the polling endpoint both
read the same table, so a reconnect can replay history exactly.
"""
import asyncio
import json
import threading
import uuid
from typing import Any, Dict, Optional, Set

from app.graph.schema import ExecutionEvent, EventType
from app.graph.store import GraphStore


class EventBus:
    def __init__(self, store: Optional[GraphStore] = None):
        self.store = store or GraphStore()
        self._waiters: Set[threading.Event] = set()
        self._lock = threading.Lock()

    def emit(
        self,
        event_type: EventType,
        task_id: Optional[str] = None,
        step_id: Optional[str] = None,
        node_id: Optional[str] = None,
        edge_id: Optional[str] = None,
        status: str = "ok",
        message: str = "",
        payload: Optional[Dict[str, Any]] = None,
    ) -> ExecutionEvent:
        event = ExecutionEvent(
            event_id=str(uuid.uuid4()), task_id=task_id, step_id=step_id,
            node_id=node_id, edge_id=edge_id, event_type=event_type,
            status=status, message=message, payload=payload or {},
        )
        self.store.append_event(event)
        with self._lock:
            for w in self._waiters:
                w.set()
        return event

    def wait_for_new(self, timeout: float = 0.5) -> bool:
        """Blocking helper used by the SSE reader loop (cross-thread wake)."""
        waiter = threading.Event()
        with self._lock:
            self._waiters.add(waiter)
        fired = waiter.wait(timeout)
        with self._lock:
            self._waiters.discard(waiter)
        return fired


_bus: Optional[EventBus] = None


def get_event_bus(store: Optional[GraphStore] = None) -> EventBus:
    global _bus
    if _bus is None:
        _bus = EventBus(store)
    return _bus


def sse_format(event: ExecutionEvent) -> str:
    data = event.model_dump(mode="json")
    return f"id: {event.seq}\nevent: {event.event_type.value}\ndata: {json.dumps(data)}\n\n"
