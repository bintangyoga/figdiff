import { compareFigcraft, formatValue, formatSummary } from "/lib/browser.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignored */ }
    ta.remove();
    return ok;
  }
}

function flash(button, label = "Copied") {
  const before = button.textContent;
  button.textContent = label;
  setTimeout(() => { button.textContent = before; }, 1600);
}

/* ---------- Hero game ---------- */
function initGame() {
  const root = $("#game");
  if (!root) return;
  const found = new Set();
  let revealed = false;
  const hints = ["Look closely at the bottom half.", "One down. Two to go.", "Nearly there. One is something that disappeared.", ""];
  const lines = [
    ["~", "Find your next summit → Find your next trail", "on screen", true],
    ["~", "layer renamed: Find your next trail", "hidden", false],
    ["~", "Get started fill #0E7C66 → #ED731A", "on screen", true],
    ["−", "I already have an account", "on screen", true],
    ["~", "Maya → Alex in “4 All set”", "other screen", false],
    ["~", "layer renamed: You’re all set, Alex", "hidden", false],
  ];
  const list = $("#result-list");
  for (const [sign, text, tag, visible] of lines) {
    const li = el("li");
    li.append(el("span", sign === "−" ? "sign minus" : "sign", sign), el("span", "txt", text), el("span", visible ? "pill" : "pill hidden", tag));
    list.append(li);
  }

  function render() {
    const n = found.size;
    const done = revealed || n === 3;
    for (const ring of $$("[data-ring]", root)) ring.hidden = !(done || found.has(ring.dataset.ring));
    $("#count").textContent = String(n);
    $$(".slots i", root).forEach((s, i) => s.classList.toggle("on", i < n));
    $("#hint").textContent = hints[n];
    $("#game-play").hidden = done;
    $("#game-done").hidden = !done;
    $("#result-eyebrow").textContent = n === 3 ? "All 3. Sharp eyes." : `You found ${n} of 3`;
  }
  const slots = $(".slots", root);
  slots.replaceChildren(el("i"), el("i"), el("i"));

  for (const spot of $$(".spot", root)) {
    spot.addEventListener("click", () => {
      if (revealed) return;
      found.add(spot.dataset.spot);
      render();
    });
  }
  $("#reveal").addEventListener("click", () => { revealed = true; render(); });
  $("#replay").addEventListener("click", () => { revealed = false; found.clear(); render(); });
  render();
}

/* ---------- Try it: compare two files in the browser ---------- */
function initTry() {
  const app = $("#try-app");
  if (!app) return;
  const state = { before: null, after: null, result: null, filter: "all" };
  const names = { before: $("#name-before"), after: $("#name-after") };
  const SLOT_LABEL = { before: "before.figcraft", after: "after.figcraft" };

  function setError(message) {
    const box = $("#report-error");
    box.textContent = message ?? "";
    box.hidden = !message;
  }

  function setFile(slot, name, bytes) {
    state[slot] = { name, bytes };
    names[slot].textContent = name;
    names[slot].classList.remove("empty");
    run();
  }

  async function readFile(slot, file) {
    setError("");
    try {
      setFile(slot, file.name, new Uint8Array(await file.arrayBuffer()));
    } catch {
      setError(`Could not read ${file.name}.`);
    }
  }

  function run() {
    if (!state.before || !state.after) return;
    setError("");
    try {
      state.result = compareFigcraft(state.before.bytes, state.after.bytes, {
        beforeName: state.before.name || SLOT_LABEL.before,
        afterName: state.after.name || SLOT_LABEL.after,
        tolerance: Number($("#tolerance").value) || 0,
      });
      state.filter = "all";
      show();
    } catch (err) {
      state.result = null;
      $("#report-body").hidden = true;
      $("#report-empty").hidden = false;
      setError(err instanceof Error ? err.message : "Could not compare these files.");
    }
  }

  /** Flat rows from the result: one per added/removed/moved layer and one per changed property. */
  function toRows(result) {
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
      else for (const p of c.props) rows.push({ ...base, kind: "changed", sign: "~", prop: p.prop, from: formatValue(p.from), to: formatValue(p.to) });
    }
    const ent = { variable: "Variable", style: "Style", collection: "Collection" };
    for (const t of result.tokens) {
      const base = { page: "", frame: "Variables and styles", label: `${ent[t.entity]} “${t.name}”` };
      if (t.kind === "added") rows.push({ ...base, kind: "tokens", sign: "+", extra: t.detail ? `(${t.detail})` : "" });
      else if (t.kind === "removed") rows.push({ ...base, kind: "tokens", sign: "−", extra: t.detail ? `(${t.detail})` : "" });
      else for (const p of t.props) rows.push({ ...base, kind: "tokens", sign: "~", prop: p.prop, from: formatValue(p.from), to: formatValue(p.to) });
    }
    return rows;
  }

  const FILTERS = [["all", "All"], ["changed", "Changed"], ["added", "Added"], ["removed", "Removed"], ["moved", "Moved"], ["tokens", "Variables"]];

  function show() {
    const { result } = state;
    $("#report-empty").hidden = true;
    $("#report-body").hidden = false;
    $("#report-title").textContent = result.summary.changes + (result.summary.tokenChanges ?? 0) === 0 ? "No changes" : formatSummary(result.summary).replace(/ \(.*\)$/, "");
    $("#report-sub").textContent = result.summary.changes === 0 && !result.summary.tokenChanges ? "These two files describe the same design." : formatSummary(result.summary).replace(/^.*?\(/, "").replace(/\)$/, "");
    const rows = toRows(result);
    const counts = { all: rows.length };
    for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;

    const bar = $("#filters");
    bar.replaceChildren();
    for (const [key, text] of FILTERS) {
      const n = counts[key] ?? 0;
      const b = el("button", "chip");
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.filter === key));
      b.disabled = key !== "all" && n === 0;
      b.append(`${text} `, el("span", "n", String(n)));
      b.addEventListener("click", () => { state.filter = key; show(); });
      bar.append(b);
    }

    const box = $("#report-rows");
    box.replaceChildren();
    const visible = rows.filter((r) => state.filter === "all" || r.kind === state.filter);
    if (visible.length === 0) {
      box.append(el("p", "report-empty", rows.length === 0 ? "Nothing changed." : "Nothing in this filter."));
      return;
    }
    const groups = new Map();
    for (const r of visible) {
      const key = `${r.page}\u0000${r.frame}`;
      if (!groups.has(key)) groups.set(key, { page: r.page, frame: r.frame, rows: [] });
      groups.get(key).rows.push(r);
    }
    let lastPage = null;
    for (const g of groups.values()) {
      if (g.page && g.page !== lastPage) { box.append(el("p", "rg-page", `Page “${g.page}”`)); lastPage = g.page; }
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
          const swatch = (v) => { const m = /#[0-9a-fA-F]{6,8}/.exec(v); if (!m) return null; const s = el("span", "sw"); s.style.background = m[0]; s.setAttribute("aria-hidden", "true"); return s; };
          const s1 = swatch(r.from); if (s1) vals.append(s1);
          vals.append(el("span", "from", r.from), el("span", "arrow", "→"));
          const s2 = swatch(r.to); if (s2) vals.append(s2);
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

  for (const slot of ["before", "after"]) {
    $(`#file-${slot}`).addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) readFile(slot, f);
      e.target.value = "";
    });
  }
  $("#tolerance").addEventListener("change", run);

  const zone = $("#dropzone");
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length >= 2) {
      readFile("before", files[0]).then(() => readFile("after", files[1]));
    } else if (files.length === 1) {
      readFile(state.before && !state.after ? "after" : "before", files[0]);
    }
  });

  $("#use-sample").addEventListener("click", async () => {
    setError("");
    try {
      const [a, b] = await Promise.all(["before", "after"].map(async (s) => {
        const res = await fetch(`/samples/ridgeline-${s}.figcraft`);
        if (!res.ok) throw new Error("sample missing");
        return new Uint8Array(await res.arrayBuffer());
      }));
      state.before = { name: "ridgeline-before.figcraft", bytes: a };
      names.before.textContent = state.before.name;
      names.before.classList.remove("empty");
      setFile("after", "ridgeline-after.figcraft", b);
    } catch {
      setError("Could not load the sample. Check your connection and try again.");
    }
  });

  $("#copy-json").addEventListener("click", async (e) => {
    if (state.result && await copyText(state.result.json)) flash(e.currentTarget);
  });
  $("#save-html").addEventListener("click", () => {
    if (!state.result) return;
    const url = URL.createObjectURL(new Blob([state.result.html], { type: "text/html" }));
    const a = el("a");
    a.href = url;
    a.download = "figdiff-report.html";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  for (const n of Object.values(names)) n.classList.add("empty");

  // The URL fragment #sample loads the sample straight away (used by links and tests).
  if (location.hash === "#try-sample") $("#use-sample").click();
}

/* ---------- Visual diff ---------- */
function initVisual() {
  const swipe = $("#swipe");
  if (!swipe) return;
  const range = $("#swipe-range");
  const set = (v) => { swipe.style.setProperty("--pos", `${v}%`); range.value = String(v); };
  range.addEventListener("input", () => set(Number(range.value)));
  let dragging = false;
  const move = (e) => {
    const r = swipe.getBoundingClientRect();
    set(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
  };
  swipe.addEventListener("pointerdown", (e) => { dragging = true; swipe.setPointerCapture(e.pointerId); move(e); });
  swipe.addEventListener("pointermove", (e) => { if (dragging) move(e); });
  swipe.addEventListener("pointerup", () => { dragging = false; });
  swipe.addEventListener("pointercancel", () => { dragging = false; });
  swipe.style.touchAction = "pan-y";

  const tabs = $$(".seg [role=tab]");
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const t of tabs) t.setAttribute("aria-selected", String(t === tab));
      for (const v of $$(".vd")) v.hidden = v.dataset.view !== tab.dataset.mode;
    });
  }
}

/* ---------- Misc ---------- */
function initMisc() {
  const toggle = $("#pr-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      $("#pr-pre").hidden = !open;
    });
  }
  for (const b of $$("[data-copy-target]")) {
    b.addEventListener("click", async () => { if (await copyText($(`#${b.dataset.copyTarget}`).textContent)) flash(b); });
  }
  const cmd = $("#cmd-copy");
  if (cmd) cmd.addEventListener("click", async () => { if (await copyText("npx figdiff@alpha before.figcraft after.figcraft")) flash(cmd); });
}

initGame();
initTry();
initVisual();
initMisc();
