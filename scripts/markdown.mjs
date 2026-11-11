// A small Markdown to HTML converter for figdiff's own docs. It supports what those files use:
// headings, paragraphs, fenced code, tables, bullet and numbered lists, block quotes, inline
// code, bold, italics and links. Everything is escaped; raw HTML in the source is not passed through.

export const escapeHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slugify = (text) =>
  text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

/** Inline formatting. `link` rewrites link targets (for example .md to .html). */
export function inline(text, link = (href) => href) {
  const codes = [];
  let s = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_m, _f, body) => {
    codes.push(`<code>${escapeHtml(body.trim())}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const target = link(href.replace(/&amp;/g, "&"));
    const external = /^https?:/.test(target);
    return `<a href="${escapeHtml(target)}"${external ? ' rel="noopener"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  // eslint-disable-next-line no-control-regex -- NUL marks the places where code spans were set aside
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
}

const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

/**
 * Convert Markdown to HTML. Returns the HTML plus the headings (for a table of contents).
 * Headings get ids; the first level 1 heading is returned as `title` and left out of the HTML.
 */
export function markdownToHtml(source, { link } = {}) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const headings = [];
  const used = new Set();
  let title = "";
  let i = 0;

  const uniqueId = (text) => {
    let id = slugify(text) || "section";
    let n = 2;
    while (used.has(id)) id = `${slugify(text)}-${n++}`;
    used.add(id);
    return id;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    const fence = line.match(/^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/);
    if (fence) {
      const close = fence[2];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(close)) body.push(lines[i++].replace(new RegExp(`^ {0,${fence[1].length}}`), ""));
      i++;
      const lang = fence[3] ? ` data-lang="${escapeHtml(fence[3])}"` : "";
      out.push(`<pre${lang}><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      if (level === 1 && !title) {
        title = h[2].replace(/`/g, "");
      } else {
        const id = uniqueId(h[2].replace(/`/g, ""));
        if (level === 2) headings.push({ id, text: h[2].replace(/`/g, "") });
        out.push(`<h${level} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inline(h[2], link)}</h${level}>`);
      }
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") rows.push(splitRow(lines[i++]));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, link)}</th>`).join("")}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${head.map((h, k) => `<td data-label="${escapeHtml(h.replace(/`/g, ""))}">${inline(r[k] ?? "", link)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table></div>",
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(body.join(" "), link)}</p></blockquote>`);
      continue;
    }

    const list = line.match(/^(\s*)([-*]|\d+\.)\s+/);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m && /\d/.test(m[2]) === ordered) {
          items.push(m[3]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += " " + lines[i++].trim();
        } else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t, link)}</li>`).join("")}</${tag}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|>|\s*(`{3,}|~{3,})|\s*([-*]|\d+\.)\s)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i++].trim());
    }
    if (para.length === 0) { para.push(lines[i++].trim()); }
    out.push(`<p>${inline(para.join(" "), link)}</p>`);
  }

  return { html: out.join("\n"), headings, title };
}
