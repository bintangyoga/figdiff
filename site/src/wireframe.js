// A rough picture of a design, drawn from the file alone (no FigCraft renderer): boxes, outlines and text.
// It shows where things are and which ones changed. It is not what the design looks like: no fonts, images,
// gradients or effects. Everything is built with DOM calls, never from strings, so a file cannot inject markup.

const NS = "http://www.w3.org/2000/svg";
const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
let counter = 0;

function node(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** The first visible solid fill as a CSS colour and opacity, or null. */
function solidFill(props) {
  const fills = Array.isArray(props.fills) ? props.fills : [];
  for (const f of fills) {
    if (f && typeof f === "object" && f.type === "solid" && f.visible !== false && f.color && typeof f.color === "object") {
      const c = (x) => Math.round(Math.min(1, Math.max(0, num(x))) * 255);
      return { color: `rgb(${c(f.color.r)},${c(f.color.g)},${c(f.color.b)})`, opacity: num(f.color.a, 1) * num(f.opacity, 1) };
    }
  }
  return null;
}

function radius(props) {
  const r = props.corners && typeof props.corners === "object" ? props.corners.radii : null;
  return Array.isArray(r) && r.length ? Math.max(0, ...r.map((x) => num(x))) : 0;
}

/** Top-level frames (children of a page) that are, or contain, a node with one of these ids. */
export function framesWithIds(tree, ids) {
  const found = [];
  for (const page of tree.children) {
    for (const frame of page.children) {
      const has = (n) => ids.has(n.id) || n.children.some(has);
      if (has(frame)) found.push({ page, frame });
    }
  }
  return found;
}

/**
 * An <svg> of one frame. `highlight` is a set of node ids to outline.
 * Stops after `maxNodes` nodes so that a very large design cannot freeze the page.
 */
export function drawFrame(frame, { highlight = new Set(), maxNodes = 3000 } = {}) {
  const w = Math.max(1, num(frame.props.width, 100));
  const h = Math.max(1, num(frame.props.height, 100));
  const svg = node("svg", { viewBox: `0 0 ${w} ${h}`, class: "wf", role: "img", "aria-label": `Wireframe of ${frame.name}` });
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  const defs = node("defs");
  svg.append(defs);
  let count = 0;
  let cut = false;

  const draw = (n, parent, isRoot) => {
    if (count >= maxNodes) {
      cut = true;
      return;
    }
    count++;
    const p = n.props;
    if (p.visible === false) return;
    const t = Array.isArray(p.transform) && p.transform.length === 6 ? p.transform : null;
    const x = isRoot ? 0 : num(t?.[4]);
    const y = isRoot ? 0 : num(t?.[5]);
    const nw = Math.max(0, num(p.width));
    const nh = Math.max(0, num(p.height));
    const g = node("g", { transform: `translate(${x} ${y})` });
    const hot = highlight.has(n.id);
    const fill = solidFill(p);
    if (n.type !== "text") {
      const shape =
        n.type === "ellipse"
          ? node("ellipse", { cx: nw / 2, cy: nh / 2, rx: nw / 2, ry: nh / 2 })
          : node("rect", { width: nw, height: nh, rx: Math.min(radius(p), nw / 2, nh / 2) });
      shape.setAttribute("fill", fill ? fill.color : "none");
      shape.setAttribute("fill-opacity", String(fill ? Math.min(fill.opacity, 1) * (hot ? 0.45 : 0.2) : 0));
      shape.setAttribute("stroke", hot ? "#ed731a" : "rgba(0,0,0,.28)");
      shape.setAttribute("stroke-width", hot ? "2.5" : "1");
      shape.setAttribute("vector-effect", "non-scaling-stroke");
      g.append(shape);
    } else {
      const lines = String(p.characters ?? "")
        .split("\n")
        .slice(0, 6);
      const fs = Math.max(6, Math.min((nh / Math.max(1, lines.length)) * 0.8, 40));
      const text = node("text", { x: 0, y: fs, "font-size": fs, fill: "#333", class: "wf-text" });
      lines.forEach((line, i) => {
        const span = node("tspan", { x: 0, dy: i === 0 ? 0 : fs * 1.25 });
        span.textContent = line.slice(0, 80);
        text.append(span);
      });
      g.append(text);
      if (hot)
        g.append(
          node("rect", {
            width: nw,
            height: nh,
            fill: "none",
            stroke: "#ed731a",
            "stroke-width": 2.5,
            "vector-effect": "non-scaling-stroke",
          }),
        );
    }
    parent.append(g);
    let into = g;
    if ((p.clip === true || isRoot) && n.children.length) {
      const id = `wf-clip-${++counter}`;
      const clip = node("clipPath", { id });
      clip.append(node("rect", { width: nw, height: nh }));
      defs.append(clip);
      into = node("g", { "clip-path": `url(#${id})` });
      g.append(into);
    }
    for (const c of n.children) draw(c, into, false);
  };

  draw(frame, svg, true);
  if (cut) svg.dataset.cut = "true";
  return svg;
}
