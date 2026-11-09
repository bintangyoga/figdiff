/**
 * figdiff's internal, format-independent model of a design.
 * The FigCraft-specific parsing lives in src/parser/.
 */
export interface DesignNode {
  /** Stable identifier of the node within the file. */
  id: string;
  /** Node type, for example "frame", "text", "rectangle". */
  type: string;
  /** Layer name shown in the editor. */
  name: string;
  /** Visual and layout properties: fills, strokes, size, position, and so on. */
  props: Record<string, unknown>;
  /** Children in layer order. */
  children: DesignNode[];
}

export interface PropChange {
  prop: string;
  from: unknown;
  to: unknown;
}

interface ChangeBase {
  /** Id of the node the change is about. */
  id: string;
  /** Names from the page down to the node (the document name is not included). */
  trail: string[];
  /** `trail` joined with " › ", prefixed by the document name. */
  path: string;
}

export type Change =
  | (ChangeBase & { kind: "added"; type: string })
  | (ChangeBase & { kind: "removed"; type: string })
  | (ChangeBase & { kind: "moved"; fromTrail: string[] })
  | (ChangeBase & { kind: "modified"; props: PropChange[] })
  | (ChangeBase & { kind: "reordered" });

export interface Summary {
  /** Total changes: added + removed + moved + reordered nodes + changed properties. */
  changes: number;
  /** Number of distinct top-level frames that contain at least one change. */
  frames: number;
  added: number;
  removed: number;
  moved: number;
  reordered: number;
  /** Number of nodes with at least one changed property. */
  modifiedNodes: number;
  /** Number of changed properties across all nodes. */
  propertyChanges: number;
}
