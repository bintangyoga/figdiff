type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Remove values FigCraft only adds when it saves a file again, so that an old file and the same
 * file saved by a newer FigCraft compare as equal. Found by running `figcraft-cli convert` on
 * FigCraft's own examples (see `scripts/compat-check.mjs`):
 *
 * - `guides: []` on the page is written as nothing at all,
 * - `layout.content_align: "auto"` is added to every auto layout.
 *
 * Only values equal to the default are dropped; real settings are kept.
 */
export function dropDefaults(props: Raw): Raw {
  const out: Raw = { ...props };
  if (Array.isArray(out.guides) && out.guides.length === 0) delete out.guides;
  if (isObject(out.layout) && out.layout.content_align === "auto") {
    const { content_align: _ignored, ...rest } = out.layout;
    out.layout = rest;
  }
  return out;
}
