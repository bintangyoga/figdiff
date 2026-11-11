const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* copy buttons on code blocks */
for (const pre of $$(".prose pre")) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "copy";
  b.textContent = "Copy";
  b.setAttribute("aria-label", "Copy code");
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector("code").textContent);
      b.textContent = "Copied";
    } catch {
      b.textContent = "Press Ctrl+C";
    }
    setTimeout(() => {
      b.textContent = "Copy";
    }, 1600);
  });
  pre.append(b);
}

/* highlight the current section in "On this page" */
const links = $$(".toc a[href^='#']");
if (links.length && "IntersectionObserver" in window) {
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          links.forEach((a) => a.classList.remove("on"));
          byId.get(e.target.id)?.classList.add("on");
        }
      }
    },
    { rootMargin: "-90px 0px -70% 0px" },
  );
  for (const id of byId.keys()) {
    const h = document.getElementById(id);
    if (h) io.observe(h);
  }
}

/* search */
const input = $("#q");
const box = $("#results");
let index = null;
async function load() {
  if (index) return index;
  try {
    index = await (await fetch("/search-index.json")).json();
  } catch {
    index = [];
  }
  return index;
}
function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 90);
  const start = Math.max(0, i - 30);
  return (start > 0 ? "…" : "") + text.slice(start, start + 100);
}
async function search() {
  const q = input.value.trim().toLowerCase();
  box.replaceChildren();
  if (q.length < 2) {
    box.hidden = true;
    return;
  }
  const data = await load();
  const hits = [];
  for (const page of data) {
    if (page.title.toLowerCase().includes(q)) hits.push({ href: page.url, title: page.title, sub: page.description, score: 3 });
    for (const h of page.headings)
      if (h.text.toLowerCase().includes(q)) hits.push({ href: `${page.url}#${h.id}`, title: h.text, sub: page.title, score: 2 });
    if (page.text.toLowerCase().includes(q)) hits.push({ href: page.url, title: page.title, sub: snippet(page.text, q), score: 1 });
  }
  const seen = new Set();
  const top = hits
    .sort((a, b) => b.score - a.score)
    .filter((h) => (seen.has(h.href + h.sub) ? false : seen.add(h.href + h.sub)))
    .slice(0, 8);
  if (top.length === 0) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "Nothing found.";
    box.append(li);
  }
  for (const h of top) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = h.href;
    a.textContent = h.title;
    const s = document.createElement("small");
    s.textContent = h.sub;
    a.append(s);
    li.append(a);
    box.append(li);
  }
  box.hidden = false;
}
if (input) {
  input.addEventListener("input", search);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      box.hidden = true;
      input.blur();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "")) {
      e.preventDefault();
      input.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) box.hidden = true;
  });
}
