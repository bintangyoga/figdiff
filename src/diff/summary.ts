import type { Change, Summary } from "./types.js";

/** Count what changed. A "frame" is a direct child of a page that contains at least one change. */
export function summarize(changes: Change[]): Summary {
  const s: Summary = {
    changes: 0,
    frames: 0,
    added: 0,
    removed: 0,
    moved: 0,
    reordered: 0,
    modifiedNodes: 0,
    propertyChanges: 0,
  };
  const frames = new Set<string>();

  for (const c of changes) {
    if (c.trail.length >= 2) frames.add(`${c.trail[0]}\u0000${c.trail[1]}`);
    switch (c.kind) {
      case "added":
        s.added++;
        break;
      case "removed":
        s.removed++;
        break;
      case "moved":
        s.moved++;
        break;
      case "reordered":
        s.reordered++;
        break;
      case "modified":
        s.modifiedNodes++;
        s.propertyChanges += c.props.length;
        break;
    }
  }

  s.frames = frames.size;
  s.changes = s.added + s.removed + s.moved + s.reordered + s.propertyChanges;
  return s;
}
