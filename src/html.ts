import type { Change, TokenChange } from "./diff/types.js";
import { summarize } from "./diff/summary.js";
import { describeToken, formatSummary, formatValue } from "./report.js";

/**
 * Images for one frame, as `data:image/...` URIs or http(s) URLs.
 * A frame that exists in only one version (added or removed) has only one side.
 */
export interface FrameImages {
  before?: string;
  after?: string;
  /** Image highlighting the pixels that differ. */
  diff?: string;
  /** Share of pixels that differ, from 0 to 1. */
  changedRatio?: number;
}

export interface HtmlOptions {
  title?: string;
  beforeName?: string;
  afterName?: string;
  /** Optional rendered images per frame; see `frameKey`. */
  images?: Record<string, FrameImages>;
  /** Changed variables and styles. */
  tokens?: TokenChange[];
}

/** Key used in `HtmlOptions.images` for a top-level frame. */
export const frameKey = (page: string, frame: string): string => `${page}\u0000${frame}`;

const SEP = " › ";
const KIND_SYMBOL = { added: "+", removed: "−", moved: ">", modified: "~", reordered: "↕" } as const;
const KIND_LABEL = { added: "Added", removed: "Removed", moved: "Moved", modified: "Changed", reordered: "Reordered" } as const;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only embedded images and web URLs are accepted, never script-capable schemes. */
function safeImageSrc(src: string): string | undefined {
  return /^(data:image\/(png|jpeg|webp|gif|svg\+xml);|https?:\/\/)/i.test(src) ? src : undefined;
}

/** Escape a value for display and add a small color swatch next to every hex color. */
function valueHtml(value: unknown): string {
  let text = formatValue(value);
  if (text.length > 240) text = text.slice(0, 240) + "…";
  return escapeHtml(text).replace(
    /#[0-9A-F]{6}(?:[0-9A-F]{2})?\b/g,
    (hex) => `<span class="sw" style="background:${hex}"></span><code>${hex}</code>`,
  );
}

function rowBody(c: Change): string {
  switch (c.kind) {
    case "added":
    case "removed":
      return `<span class="type">${escapeHtml(c.type)}</span>`;
    case "moved":
      return `<span class="note">moved from ${escapeHtml(c.fromTrail.join(SEP) || "(root)")}</span>`;
    case "reordered":
      return `<span class="note">layer order changed</span>`;
    case "modified":
      return (
        `<ul class="props">` +
        c.props
          .map(
            (p) =>
              `<li><span class="prop">${escapeHtml(p.prop)}</span>` +
              `<span class="from">${valueHtml(p.from)}</span><span class="arrow">→</span>` +
              `<span class="to">${valueHtml(p.to)}</span></li>`,
          )
          .join("") +
        `</ul>`
      );
  }
}

function row(c: Change, label: string): string {
  return (
    `<li class="chg ${c.kind}" data-kind="${c.kind}">` +
    `<span class="badge" title="${KIND_LABEL[c.kind]}">${KIND_SYMBOL[c.kind]}</span>` +
    `<div class="what"><span class="label">${escapeHtml(label)}</span>${rowBody(c)}` +
    (c.instances ? `<span class="note">in a component used by ${c.instances} instance${c.instances === 1 ? "" : "s"}</span>` : "") +
    `</div></li>`
  );
}

function percent(ratio: number): string {
  const p = ratio * 100;
  if (p === 0) return "0%";
  return p < 0.1 ? "<0.1%" : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

function compare(images: FrameImages | undefined): string {
  if (!images) return "";
  const before = images.before && safeImageSrc(images.before);
  const after = images.after && safeImageSrc(images.after);
  const diff = images.diff && safeImageSrc(images.diff);

  if (before && after) {
    const tabs =
      `<div class="tabs"><button type="button" data-view="swipe" aria-pressed="true">Swipe</button>` +
      `<button type="button" data-view="side" aria-pressed="false">Side by side</button>` +
      (diff ? `<button type="button" data-view="diff" aria-pressed="false">Difference</button>` : "") +
      (diff && images.changedRatio !== undefined
        ? `<span class="ratio">${escapeHtml(percent(images.changedRatio))} of pixels differ</span>`
        : "") +
      `</div>`;
    return (
      `<div class="cmp" data-view="swipe" style="--pos:50%">${tabs}` +
      `<div class="stack"><img class="b" alt="Before" src="${escapeHtml(before)}">` +
      `<img class="a" alt="After" src="${escapeHtml(after)}"></div>` +
      (diff ? `<img class="diffimg" alt="Differences highlighted" src="${escapeHtml(diff)}" hidden>` : "") +
      `<input type="range" min="0" max="100" value="50" aria-label="Slide between before and after">` +
      `<div class="cap"><span>Before</span><span>After</span></div></div>`
    );
  }

  const only = after ?? before;
  if (!only) return "";
  return (
    `<figure class="single"><img alt="${after ? "After" : "Before"}" src="${escapeHtml(only)}">` +
    `<figcaption>${after ? "Added: only in the new version" : "Removed: only in the old version"}</figcaption></figure>`
  );
}

const CSS = `
:root{--bg:#fff;--fg:#1c1c1e;--muted:#6b6b70;--line:#e3e3e8;--card:#f7f7f9;--add:#1a7f37;--rem:#c62828;--mod:#8a5a00;--mov:#5b3fc0;--reo:#00796b}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#ececf0;--muted:#9a9aa3;--line:#2e2e33;--card:#1f1f23;--add:#56d364;--rem:#ff7b72;--mod:#e3b341;--mov:#a99bff;--reo:#4fd1c5}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:22px;margin:0 0 4px}
.files{color:var(--muted);margin:0 0 16px;overflow-wrap:anywhere}
.files code{color:var(--fg)}
.summary{font-size:16px;margin:0 0 16px}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px}
.filters button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 12px;cursor:pointer}
.filters button[aria-pressed=false]{opacity:.45;text-decoration:line-through}
h2{font-size:17px;margin:32px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line)}
details{border:1px solid var(--line);border-radius:10px;margin:12px 0;background:var(--card)}
summary{cursor:pointer;padding:10px 14px;font-weight:600;display:flex;justify-content:space-between;gap:12px}
summary .count{color:var(--muted);font-weight:400;white-space:nowrap}
.body{padding:0 14px 12px}
ul.list{list-style:none;margin:0;padding:0}
ul.tokens li{font:13px ui-monospace,monospace;padding:2px 0}
.chg{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.chg[hidden]{display:none}
.badge{flex:none;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font:600 13px/1 ui-monospace,monospace;color:var(--bg)}
.added .badge{background:var(--add)}.removed .badge{background:var(--rem)}.modified .badge{background:var(--mod)}.moved .badge{background:var(--mov)}.reordered .badge{background:var(--reo)}
.what{min-width:0}
.label{font-weight:600;overflow-wrap:anywhere}
.type,.note{color:var(--muted);margin-left:8px;font-size:13px}
ul.props{list-style:none;margin:4px 0 0;padding:0}
ul.props li{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;padding:1px 0}
.prop{color:var(--muted);min-width:84px}
.arrow{color:var(--muted)}
code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid var(--line);vertical-align:-1px;margin-right:4px}
.cmp{margin:4px 0 12px}
.stack{position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg)}
.stack img{display:block;width:100%;height:auto}
.stack img.a{position:absolute;inset:0;clip-path:inset(0 0 0 var(--pos))}
.cmp input{width:100%;margin:6px 0 0}
.cap{display:flex;justify-content:space-between;color:var(--muted);font-size:12px}
.tabs{display:flex;align-items:center;gap:6px;margin:0 0 6px}
.tabs button{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:6px;padding:2px 10px;cursor:pointer}
.tabs button[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.tabs .ratio{margin-left:auto;color:var(--muted);font-size:12px}
.diffimg{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
.diffimg[hidden]{display:none}
.cmp[data-view=diff] input,.cmp[data-view=diff] .cap,.cmp[data-view=diff] .stack,.cmp[data-view=side] input{display:none}
.cmp[data-view=side] .stack{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:0;border-radius:0;overflow:visible;background:none}
.cmp[data-view=side] .stack img{border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.cmp[data-view=side] .stack img.a{position:static;clip-path:none}
figure.single{margin:4px 0 12px}
figure.single img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
figure.single figcaption{color:var(--muted);font-size:12px;margin-top:4px}
footer{margin-top:40px;color:var(--muted);font-size:12px}
`;

const SCRIPT = `
document.querySelectorAll('.filters button').forEach(function(btn){
  btn.addEventListener('click',function(){
    var on=btn.getAttribute('aria-pressed')!=='true';
    btn.setAttribute('aria-pressed',String(on));
    var kind=btn.getAttribute('data-kind');
    document.querySelectorAll('.chg[data-kind="'+kind+'"]').forEach(function(el){el.hidden=!on;});
  });
});
document.querySelectorAll('.cmp').forEach(function(c){
  var r=c.querySelector('input');
  r.addEventListener('input',function(){c.style.setProperty('--pos',r.value+'%');});

  c.querySelectorAll('.tabs button').forEach(function(t){
    t.addEventListener('click',function(){
      var view=t.getAttribute('data-view');
      c.setAttribute('data-view',view);
      var d=c.querySelector('.diffimg');
      if(d)d.hidden=view!=='diff';
      c.querySelectorAll('.tabs button').forEach(function(o){o.setAttribute('aria-pressed',String(o===t));});
    });
  });
});
`;

/** A single self-contained HTML page describing the changes. No network access needed to view it. */
export function formatHtml(changes: Change[], options: HtmlOptions = {}): string {
  const title = options.title ?? "figdiff report";
  const tokens = options.tokens ?? [];
  const summary = summarize(changes, tokens);

  const pages = new Map<string, Map<string, Change[]>>();
  for (const c of changes) {
    const page = c.trail[0] ?? "(document)";
    const frame = c.trail[1] ?? "";
    const frames = pages.get(page) ?? new Map<string, Change[]>();
    frames.set(frame, [...(frames.get(frame) ?? []), c]);
    pages.set(page, frames);
  }

  const kinds = (["added", "removed", "modified", "moved", "reordered"] as const).filter((k) =>
    changes.some((c) => c.kind === k),
  );
  const filters = kinds
    .map((k) => `<button type="button" data-kind="${k}" aria-pressed="true">${KIND_SYMBOL[k]} ${KIND_LABEL[k]}</button>`)
    .join("");

  let sections = "";
  for (const [page, frames] of pages) {
    sections += `<h2>Page “${escapeHtml(page)}”</h2>`;
    for (const [frame, group] of frames) {
      const heading = frame === "" ? "Page itself" : `Frame “${escapeHtml(frame)}”`;
      const images = frame === "" ? undefined : options.images?.[frameKey(page, frame)];
      const nodeCount = new Set(group.map((c) => c.id)).size;
      const items = group
        .map((c) => row(c, c.trail.length > 2 ? c.trail.slice(2).join(SEP) : frame === "" ? "(page)" : "(frame itself)"))
        .join("");
      sections +=
        `<details open><summary><span>${heading}</span><span class="count">${nodeCount} ${nodeCount === 1 ? "node" : "nodes"}</span></summary>` +
        `<div class="body">${compare(images)}<ul class="list">${items}</ul></div></details>`;
    }
  }

  if (tokens.length > 0) {
    const lines = tokens.flatMap((t) => describeToken(t).map((l) => `<li>${escapeHtml(l)}</li>`)).join("");
    sections +=
      `<h2>Variables and styles</h2><details open><summary><span>Variables and styles</span>` +
      `<span class="count">${tokens.length} ${tokens.length === 1 ? "change" : "changes"}</span></summary>` +
      `<div class="body"><ul class="list tokens">${lines}</ul></div></details>`;
  }

  const files =
    options.beforeName || options.afterName
      ? `<p class="files"><code>${escapeHtml(options.beforeName ?? "before")}</code> → <code>${escapeHtml(options.afterName ?? "after")}</code></p>`
      : "";

  const body =
    changes.length === 0 && tokens.length === 0
      ? `<p class="summary">No changes.</p>`
      : `<p class="summary">${escapeHtml(formatSummary(summary))}</p><div class="filters">${filters}</div>${sections}`;

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><main>` +
    `<h1>${escapeHtml(title)}</h1>${files}${body}` +
    `<footer>Generated by figdiff. Changes are matched by node id.</footer>` +
    `</main><script>${SCRIPT}</script></body></html>\n`
  );
}
