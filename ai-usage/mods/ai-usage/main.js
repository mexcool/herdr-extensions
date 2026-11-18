import { View, div } from "gpui-kit";
import { HoverCard, h_flex, v_flex } from "gpui-base";
import { exec, spaces, theme, checking } from "herdr";
import { PROBE, parse, merge, level, elapsed, nextMonth, money, until, clock, date, ago } from "./probe.js";

// The tick bars and the hover panel follow nozikov/herdr-usage-limits (MIT); the
// data sources follow steipete/CodexBar.

// Plan windows move slowly, and Anthropic's endpoint throttles frequent polling.
const EVERY = 5 * 60 * 1000;
const RETRY = 60 * 1000;
const ACCOUNTS = {
  claude: { name: "Claude", dashboard: "https://claude.ai/settings/usage" },
  codex: { name: "Codex", dashboard: "https://chatgpt.com/codex/cloud/settings/analytics#usage" },
};
const STALE = 0.55;

const activeMachine = () => spaces().find((s) => s.active)?.machine ?? null;

const levelColor = (lv, t) => (lv === "hot" ? t.ansi1 : lv === "warn" ? t.ansi3 : t.ansi2);

// A 4px track filled to `used` percent, with a 1×8px tick at `tick` (0..1) when
// given: a fill past the tick is using the window faster than the clock.
function bar(width, used, tick, t) {
  return div().relative().w(width).h(4).rounded(2).bg(t.border).flex_none()
    .child(div().absolute().left(0).top(0).h(4).rounded(2).w(Math.round((width * Math.min(100, used)) / 100)).bg(levelColor(level(used), t)))
    .when(tick !== null, (b) => b.child(div().absolute().top(-2).left(Math.round(width * tick)).w(1).h(8).bg(t.foreground).opacity(0.75)));
}

const tinted = (used, t) => (level(used) === "ok" ? t.foreground : levelColor(level(used), t));

export default class AiUsage extends View {
  init(_props, cx) {
    // The last reading and the next probe per machine (null: this computer), so a
    // space switch shows that machine's accounts at once, and probes only a
    // machine not read for EVERY.
    this.readings = new Map();
    this.due = new Map();
    this.busy = false;
    this.minute = 0;
    if (checking()) return;
    cx.timer.every(1000, (cx) => this.tick(cx));
    this.tick(cx);
  }

  tick(cx) {
    // Redraw once a minute, so ticks, countdowns and ages move between probes.
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== this.minute) {
      this.minute = minute;
      cx.notify();
    }
    const on = activeMachine();
    if (this.busy || Date.now() < (this.due.get(on) ?? 0)) return;
    this.busy = true;
    cx.notify(); // the refresh button shows it
    cx.spawn(async (cx) => {
      let next = null;
      try {
        const r = await exec("sh", ["-c", PROBE], { on, timeout: 60000 });
        next = parse(r.stdout);
      } catch (_e) {
        // The machine is unreachable: the last reading stays, marked stale.
      }
      const now = Date.now();
      const reading = merge(this.readings.get(on), next, now);
      if (reading.claude || reading.codex) this.readings.set(on, reading);
      else this.readings.delete(on);
      const fresh = [reading.claude, reading.codex].some((p) => p?.at === now);
      this.due.set(on, now + (fresh ? EVERY : RETRY));
      this.busy = false;
      cx.notify();
    });
  }

  refresh(cx) {
    this.due.set(activeMachine(), 0);
    this.tick(cx);
  }

  // The status-bar row. Per account: its name; per window its label, bar with
  // tick, percent used and, once amber or red, the time to reset; then Claude's
  // `+$X` extra usage this month. A stale account is dimmed, one waiting for its
  // first answer shows "…", an unreadable one "!".
  summary(r, now, t) {
    const segment = (w) =>
      h_flex().gap(4).items_center().flex_none()
        .child(div().text_size(10.5).child(w.label))
        .child(bar(24, w.used, elapsed(w, now), t))
        .child(div().text_color(tinted(w.used, t)).child(`${Math.round(w.used)}%`))
        .when(level(w.used) !== "ok", (s) => s.child(div().child(until(w.resets, now))));
    const group = (key) => {
      const a = r[key];
      const g = h_flex().gap(8).items_center().flex_none().opacity(a.stale ? STALE : 1).child(key);
      if (a.error) return g.child(div().text_color(t.ansi1).child("!"));
      if (a.pending) return g.child(div().child("…"));
      g.children(a.windows.map(segment));
      if (a.extra?.used > 0) {
        const share = (100 * a.extra.used) / a.extra.cap;
        g.child(div().text_color(level(share) === "ok" ? t.dim : levelColor(level(share), t)).child(`+${money(a.extra.used, a.extra.currency)}`));
      }
      return g;
    };
    return h_flex().id("ai-usage-row").gap(14).items_center().flex_none()
      .children(["claude", "codex"].filter((key) => r[key]).map(group));
  }

  // The hover panel. Per account: its name, plan and dashboard link; what answered
  // and when; a line per window; then Claude's extra usage and saved resets, or
  // Codex's credits and reset credits. A refresh button at the bottom.
  details(r, now, t) {
    const small = (text) => div().text_size(11).text_color(t.dim).child(text);
    const line = (name, gauge, value, when) =>
      h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(name))
        .child(gauge)
        .child(div().w(64).flex_none().flex().justify_end().child(value))
        .child(div().w(116).flex_none().flex().justify_end().whitespace_nowrap().text_size(11).text_color(t.dim).child(when));
    const windowLine = (w) =>
      line(w.name, bar(110, w.used, elapsed(w, now), t),
        div().text_color(tinted(w.used, t)).child(`${Math.round(100 - w.used)}% left`),
        `${until(w.resets, now)} · ${clock(w.resets, now)}`);
    const header = (key, a) =>
      h_flex().gap(6).items_center()
        .child(div().flex_none().font_semibold().child(ACCOUNTS[key].name))
        .when(Boolean(a.plan), (h) => h.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10).text_color(t.accent).child(a.plan)))
        .child(div().flex_1())
        .child(div().id(`ai-usage-dashboard-${key}`).flex_none().text_size(11).text_color(t.accent).cursor_pointer()
          .on_click((_e, cx) => cx.open_url(ACCOUNTS[key].dashboard)).child("Usage dashboard ↗"));
    const section = (key) => {
      const a = r[key];
      const s = v_flex().gap(6).child(header(key, a));
      if (a.error) return s.child(div().text_size(11).text_color(t.ansi1).child("! Couldn't read its usage"));
      const reason = (code) => (code === "offline" ? "machine unreachable" : code === "000" ? "no network" : code === "429" ? "rate-limited (HTTP 429)" : `HTTP ${code}`);
      if (a.pending) return s.child(small(`${reason(a.pending)}, retrying in ${until(this.due.get(activeMachine()) ?? now, now)}`));
      const why = a.stale === "offline" ? reason(a.stale) : `couldn't refresh: ${reason(a.stale)}`;
      s.child(small(`via ${a.via === "api" ? "API" : "CLI"} · updated ${ago(a.at, now)}${a.stale ? ` · ${why}` : ""}`));
      s.child(v_flex().gap(6).opacity(a.stale ? STALE : 1).children(a.windows.map(windowLine)));
      if (a.extra) {
        const share = (100 * a.extra.used) / a.extra.cap;
        s.child(line("Extra usage", bar(110, share, null, t),
          div().text_color(tinted(share, t)).child(`${money(a.extra.used, a.extra.currency, true)}`),
          `of ${money(a.extra.cap, a.extra.currency)} · resets ${date(nextMonth(now))}`)
          .id("ai-usage-extra").tooltip("Extra usage this month. Claude doesn't say when it resets: assumed the 1st, 00:00 UTC."));
      }
      if (a.credits) s.child(line("Credits", div().w(110).flex_none(), a.credits.unlimited ? "unlimited" : (a.credits.balance ?? "available"), ""));
      if (a.resets) {
        const kind = key === "claude" ? "Saved resets" : "Reset credits";
        s.child(small(`${kind}: ${a.resets.left} available${a.resets.next ? ` · next expires ${date(a.resets.next)}` : ""}`));
      }
      return s;
    };
    const rule = () => div().h(1).bg(t.border).flex_none();
    const body = v_flex().id("ai-usage-panel-body").w(460).p(12).gap(10).rounded(8).border(1).border_color(t.border)
      .bg(t.popover).shadow_lg().text_size(12).text_color(t.foreground);
    ["claude", "codex"].filter((key) => r[key]).forEach((key, i) => {
      if (i > 0) body.child(rule());
      body.child(section(key));
    });
    return body.child(rule()).child(
      h_flex().justify_end().child(
        div().id("ai-usage-refresh").px(8).py(2).rounded(4).text_size(11).text_color(this.busy ? t.dim : t.muted)
          .when(!this.busy, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.refresh(cx)))
          .child(this.busy ? "↻ Refreshing…" : "↻ Refresh")));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const root = h_flex().size_full().px(14).items_center().justify_end().overflow_hidden()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.dim);
    const r = this.readings.get(activeMachine());
    if (!r) return root;
    return root.child(HoverCard.new("ai-usage-panel").anchor("bottom_right").open_delay(350).close_delay(300)
      .trigger(this.summary(r, now, t))
      .content(this.details(r, now, t)));
  }
}
