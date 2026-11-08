/**
 * figdiff's internal, format-independent model of a design.
 *
 * NOTE: this model is provisional. It will be adjusted once the real
 * `document.json` schema is documented in Phase 0 (see docs/format-notes.md).
 */
export interface DesignNode {
  /** Stable identifier of the node within the file. */
  id: string;
  /** Node type, for example "FRAME", "TEXT", "RECTANGLE". */
  type: string;
  /** Layer name shown in the editor. */
  name: string;
  /** Visual and layout properties: fills, strokes, size, position, and so on. */
  props: Record<string, unknown>;
  children: DesignNode[];
}

export interface PropChange {
  prop: string;
  from: unknown;
  to: unknown;
}

export type Change =
  | { kind: "added"; id: string; path: string; type: string }
  | { kind: "removed"; id: string; path: string; type: string }
  | { kind: "moved"; id: string; path: string; from: string; to: string }
  | { kind: "modified"; id: string; path: string; props: PropChange[] };
