// usage-strip: Claude / Codex / Grok plan usage as mini bars, from `token-status --json`.
// Click it for details. https://github.com/shanev/token-status
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, run, theme, props, shared, setShared, openOverlay, closeOverlay } from "herdr";

// The machine where token-status is installed: a name from `hc machine ls`, or null for this one.
const MACHINE = null;
const REFRESH_MS = 5 * 60 * 1000;
const CMD = ["/bin/sh", ["-c", 'exec "$HOME/.local/bin/token-status" --json']];
const NAMES = { claude: "Claude", codex: "Codex", grok: "Grok" };
const KEY = "usage-strip.data";

// "Weekly (all models)" -> "wk", "5-hour session" -> "5h", "Weekly (Fable)" -> "Fable"
function short(label) {
  const scoped = label.match(/\(([^)]+)\)/);
  if (scoped && scoped[1] !== "all models") return scoped[1];
  if (/^5-hour/.test(label)) return "5h";
  if (/^Weekly/.test(label)) return "wk";
  if (/^Monthly/.test(label)) return "mo";
  return label;
}

const pad = (n) => String(n).padStart(2, "0");
function clock(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function when(iso) {
  const d = new Date(iso);
  const secs = Math.max(0, (d - Date.now()) / 1000);
  const days = Math.floor(secs / 86400), hrs = Math.floor((secs % 86400) / 3600), mins = Math.floor((secs % 3600) / 60);
  const rel = days ? `${days}d ${hrs}h` : hrs ? `${hrs}h ${mins}m` : `${mins}m`;
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${rel} (${day} ${clock(iso)})`;
}

function tone(l, t) {
  const p = l.pace || {};
  if (p.hits_limit_at || l.percent >= 95) return t.ansi1 ?? t.blocked;
  if ((p.projected_pct ?? 0) > 85 || l.percent >= 85) return t.ansi3 ?? t.working;
  return t.ansi2 ?? t.done;
}

function describe(l) {
  const p = l.pace || {};
  const parts = [`${l.label}: ${Math.round(l.percent)}% used`];
  if (l.resets_at) parts.push(`resets in ${when(l.resets_at)}`);
  if (p.hits_limit_at) parts.push(`at this pace, runs out in ${when(p.hits_limit_at)}`);
  else if (p.projected_pct != null) parts.push(`on pace for ~${Math.round(p.projected_pct)}% by reset`);
  return parts.join(" · ");
}

// A bar with the used share filled and a tick where the window's elapsed time is.
function bar(l, t, w, h) {
  const used = Math.max(0, Math.min(100, l.percent));
  const el = l.pace?.elapsed_pct;
  let b = div().relative().w(w).h(h).rounded(h / 2).bg(t.border)
    .child(div().absolute().left(0).top(0).h(h).w((w * used) / 100).rounded(h / 2).bg(tone(l, t)));
  if (el != null) b = b.child(div().absolute().top(-2).h(h + 4).w(1.5).left(Math.min(w - 1.5, (w * el) / 100)).bg(t.foreground));
  return b;
}

export default class UsageStrip extends View {
  init(_props, cx) {
    this.detail = Boolean(props()?.detail);
    this.loading = false;
    this.error = null;
    if (!this.detail) {
      cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
      this.refresh(cx);
    }
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec(CMD[0], CMD[1], { on: MACHINE, timeout: 120000 });
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`);
        setShared(KEY, { ...JSON.parse(r.stdout), error: null });
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e); // keep the last good numbers on screen
        const old = shared(KEY);
        if (old) setShared(KEY, { ...old, error: this.error });
      }
      this.loading = false;
      cx.notify();
    });
  }

  render(cx) {
    return this.detail ? this.renderDetail(cx) : this.renderStrip(cx);
  }

  // ---------- the strip ----------
  renderStrip() {
    const t = theme();
    const data = shared(KEY);
    const row = h_flex().id("usage-strip").size_full().px(14).gap(18).items_center().justify_end()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click(() => openOverlay({ mod: "usage-strip", props: { detail: true }, kind: "popup", width: 440, height: 360, at: "pointer" }));
    if (!data) {
      return row.child(this.error ? div().text_color(t.ansi1 ?? t.blocked).truncate().child(`usage: ${this.error}`)
                                  : div().child("usage: loading…"));
    }
    if (data.error) row.child(div().text_color(t.ansi3 ?? t.working).tooltip(`Last refresh failed: ${data.error}`).id("stale").child("stale"));
    for (const key of Object.keys(NAMES)) {
      const p = data[key];
      if (!p) continue;
      const seg = h_flex().gap(10).items_center().child(div().text_color(t.foreground).child(NAMES[key]));
      if (p.error) seg.child(div().text_color(t.ansi1 ?? t.blocked).child("error"));
      p.limits.forEach((l, i) => seg.child(
        h_flex().id(`${key}-${i}`).gap(5).items_center().tooltip(describe(l))
          .child(div().text_color(t.dim).child(short(l.label)))
          .child(bar(l, t, 34, 5))
          .child(div().text_color(l.pace?.hits_limit_at ? (t.ansi1 ?? t.blocked) : t.foreground)
            .child(`${Math.round(l.percent)}%${l.pace?.hits_limit_at ? " ▲" : ""}`))));
      row.child(seg);
    }
    return row;
  }

  // ---------- the popup ----------
  renderDetail(cx) {
    const t = theme();
    const data = shared(KEY);
    const box = v_flex().id("usage-detail").size_full().p(14).gap(12).bg(t.popover).text_size(12.5).text_color(t.foreground)
      .overflow_y_scrollbar();
    if (!data) return box.child(div().text_color(t.muted).child("No data yet."));
    for (const key of Object.keys(NAMES)) {
      const p = data[key];
      if (!p) continue;
      const sec = v_flex().gap(6).child(div().font_semibold().child(NAMES[key]));
      if (p.error) sec.child(div().text_color(t.ansi1 ?? t.blocked).child(p.error));
      for (const l of p.limits) {
        const pc = l.pace || {};
        const note = pc.hits_limit_at ? `▲ at this pace, runs out in ${when(pc.hits_limit_at)}`
          : pc.projected_pct != null ? `on pace for ~${Math.round(pc.projected_pct)}% by reset` : "";
        sec.child(v_flex().gap(3)
          .child(h_flex().gap(8).items_center()
            .child(div().w(130).truncate().child(l.label))
            .child(bar(l, t, 180, 6))
            .child(div().w(40).text_color(tone(l, t)).child(`${Math.round(l.percent)}%`)))
          .child(h_flex().gap(8).text_size(11.5)
            .child(div().w(130).text_color(t.dim).child(l.resets_at ? `↻ ${when(l.resets_at)}` : ""))
            .child(div().text_color(pc.hits_limit_at ? (t.ansi1 ?? t.blocked) : t.muted).child(note))));
      }
      if (p.note) sec.child(div().text_size(11.5).text_color(t.dim).child(p.note));
      box.child(sec);
    }
    const link = (id, text, fn) => div().id(id).text_color(t.accent).hover((s) => s.underline()).on_click(fn).child(text);
    return box.child(h_flex().gap(14).items_center().text_size(11.5).text_color(t.dim)
      .child(div().child(`Updated ${clock(data.fetched_at)}${data.error ? " · stale" : ""} · │ = time elapsed`))
      .child(div().flex_1())
      .child(link("refresh", this.loading ? "Refreshing…" : "Refresh", (_e, cx) => this.refresh(cx)))
      .child(link("panel", "Open panel", () => {
        closeOverlay(props().overlay);
        run("pane.split", { direction: "right", argv: CMD.flat() });
      })));
  }
}
