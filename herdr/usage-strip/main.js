// usage-strip: one line of Claude / Codex / Grok plan usage, from `token-status --json`.
// https://github.com/shanev/token-status
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, run, theme } from "herdr";

// The machine where token-status is installed: a name from `hc machine ls`, or null for this one.
const MACHINE = null;
const REFRESH_MS = 5 * 60 * 1000;
const CMD = ["/bin/sh", ["-c", 'exec "$HOME/.local/bin/token-status" --json']];
const NAMES = { claude: "Claude", codex: "Codex", grok: "Grok" };

// "Weekly (all models)" -> "wk", "5-hour session" -> "5h", "Weekly (Fable)" -> "Fable"
function short(label) {
  const scoped = label.match(/\(([^)]+)\)/);
  if (scoped && scoped[1] !== "all models") return scoped[1];
  if (/^5-hour/.test(label)) return "5h";
  if (/^Weekly/.test(label)) return "wk";
  if (/^Monthly/.test(label)) return "mo";
  return label;
}

export default class UsageStrip extends View {
  init(_props, cx) {
    this.data = null;
    this.error = null;
    this.loading = false;
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec(CMD[0], CMD[1], { on: MACHINE, timeout: 120000 });
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`);
        this.data = JSON.parse(r.stdout);
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e); // keep the last good numbers on screen
      }
      this.loading = false;
      cx.notify();
    });
  }

  tone(l, t) {
    const p = l.pace || {};
    if (p.hits_limit_at || l.percent >= 95) return t.ansi1 ?? t.blocked;
    if ((p.projected_pct ?? 0) > 85 || l.percent >= 85) return t.ansi3 ?? t.working;
    return t.foreground;
  }

  limit(l, t) {
    const hit = l.pace?.hits_limit_at;
    return h_flex().gap(3).items_center()
      .child(div().text_color(t.dim).child(short(l.label)))
      .child(div().text_color(this.tone(l, t)).child(`${Math.round(l.percent)}%${hit ? " ▲" : ""}`));
  }

  render() {
    const t = theme();
    const row = h_flex().id("usage-strip").size_full().px(14).gap(16).items_center()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("pane.split", { direction: "right", argv: CMD.flat() }));
    if (!this.data) {
      return row.child(this.error ? div().text_color(t.ansi1 ?? t.blocked).truncate().child(`usage: ${this.error}`)
                                  : div().child("usage: loading…"));
    }
    for (const key of Object.keys(NAMES)) {
      const p = this.data[key];
      if (!p) continue;
      const seg = h_flex().gap(8).items_center().child(div().font_semibold().child(NAMES[key]));
      if (p.error) seg.child(div().text_color(t.ansi1 ?? t.blocked).child("error"));
      for (const l of p.limits) seg.child(this.limit(l, t));
      row.child(seg);
    }
    const at = new Date(this.data.fetched_at);
    const stamp = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    return row
      .child(div().flex_1())
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.ansi3 ?? t.working).child("stale")))
      .child(div().text_color(t.dim).child(this.loading ? "updating…" : `▲ = runs out before reset · ${stamp}`));
  }
}
