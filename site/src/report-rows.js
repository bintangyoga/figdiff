import { formatValue } from "/lib/browser.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Flat rows from the result: one per added/removed/moved layer and one per changed property. */
export function toRows(result) {
  const rows = [];
  const frameOf = (c) => ({ page: c.trail[0] ?? "(document)", frame: c.trail[1] ?? "" });
  const label = (c) => (c.trail.length > 2 ? c.trail.slice(2).join(" › ") : c.trail.length > 1 ? "(frame itself)" : "(page)");
  for (const c of result.changes) {
    const where = frameOf(c);
    const base = { ...where, label: label(c) };
    if (c.kind === "added") rows.push({ ...base, kind: "added", sign: "+", extra: `(${c.type})` });
    else if (c.kind === "removed") rows.push({ ...base, kind: "removed", sign: "−", extra: `(${c.type})` });
    else if (c.kind === "moved") rows.push({ ...base, kind: "moved", sign: "↳", from: c.fromTrail.join(" › "), to: c.trail.join(" › ") });
    else if (c.kind === "reordered") rows.push({ ...base, kind: "moved", sign: "⇅", extra: "layers reordered" });
    else
      for (const p of c.props)
        rows.push({
          ...base,
          kind: "changed",
          sign: "~",
          prop: p.prop,
          from: formatValue(p.from),
          to: formatValue(p.to),
          extra: p.derived ? "follows the text" : "",
        });
  }
  const ent = { variable: "Variable", style: "Style", collection: "Collection" };
  for (const t of result.tokens) {
    const base = { page: "", frame: "Variables and styles", label: `${ent[t.entity]} “${t.name}”` };
    if (t.kind === "added") rows.push({ ...base, kind: "tokens", sign: "+", extra: t.detail ? `(${t.detail})` : "" });
    else if (t.kind === "removed") rows.push({ ...base, kind: "tokens", sign: "−", extra: t.detail ? `(${t.detail})` : "" });
    else
      for (const p of t.props)
        rows.push({ ...base, kind: "tokens", sign: "~", prop: p.prop, from: formatValue(p.from), to: formatValue(p.to) });
  }
  return rows;
}

/** Draws rows (from toRows) into `box`, grouped by page and frame. Everything goes in as text, never as HTML. */
export function renderRows(box, visible) {
  const groups = new Map();
  for (const r of visible) {
    const key = `${r.page}\u0000${r.frame}`;
    if (!groups.has(key)) groups.set(key, { page: r.page, frame: r.frame, rows: [] });
    groups.get(key).rows.push(r);
  }
  let lastPage = null;
  for (const g of groups.values()) {
    if (g.page && g.page !== lastPage) {
      box.append(el("p", "rg-page", `Page “${g.page}”`));
      lastPage = g.page;
    }
    const wrap = el("div", "rg");
    if (g.frame) wrap.append(el("h3", "", g.page ? `Frame “${g.frame}”` : g.frame));
    const list = el("div", "rows");
    for (const r of g.rows) {
      const row = el("div", "row");
      row.append(el("span", `sign ${r.sign === "−" ? "minus" : r.sign === "+" ? "plus" : ""}`.trim(), r.sign));
      const main = el("div", "main");
      const top = el("div");
      top.append(el("span", "path", r.label));
      if (r.prop) top.append(el("span", "prop", r.prop));
      if (r.extra) top.append(el("span", "prop", r.extra));
      main.append(top);
      if (r.from !== undefined) {
        const vals = el("div", "vals");
        const swatch = (v) => {
          const m = /#[0-9a-fA-F]{6,8}/.exec(v);
          if (!m) return null;
          const s = el("span", "sw");
          s.style.background = m[0];
          s.setAttribute("aria-hidden", "true");
          return s;
        };
        const s1 = swatch(r.from);
        if (s1) vals.append(s1);
        vals.append(el("span", "from", r.from), el("span", "arrow", "→"));
        const s2 = swatch(r.to);
        if (s2) vals.append(s2);
        vals.append(el("span", "to", r.to));
        main.append(vals);
      }
      row.append(main);
      list.append(row);
    }
    wrap.append(list);
    box.append(wrap);
  }
}
