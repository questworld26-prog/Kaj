// [spec: PROJ-001]
// [spec: UI-001]
export interface MutationEvent {
  type: "task" | "project";
  action:
    | "created"
    | "updated"
    | "moved"
    | "completed"
    | "reopened"
    | "deleted"
    | "restored"
    | "reordered"
    | "triaged";

  id: string;
  data?: unknown;
}

export type EventListener = (event: MutationEvent) => void;

export class EventBus {
  private listeners: Set<EventListener> = new Set();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: MutationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in event listener:", err);
      }
    }
  }
}
