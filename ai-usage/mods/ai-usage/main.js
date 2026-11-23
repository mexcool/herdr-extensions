import { View, div } from "gpui-kit";
import { HoverCard, h_flex, v_flex } from "gpui-base";
import { exec, theme, checking, props, run, shared, setShared } from "herdr";
import { PROBE, parse, merge, record, recentRate, level, elapsed, deficit, pace, countdown, nextMonth, money, until, clock, date, ago } from "./probe.js";

// The tick bars and the hover panel follow nozikov/herdr-usage-limits (MIT); the
// data sources follow steipete/CodexBar.

// Plan windows move slowly, and Anthropic's endpoint throttles frequent polling.
const EVERY = 5 * 60 * 1000;
const RETRY = 60 * 1000;
// Rate-limited (HTTP 429): wait EVERY, doubling while it lasts, up to MAX_WAIT.
const MAX_WAIT = 30 * 60 * 1000;
const ACCOUNTS = {
  claude: { name: "Claude", dashboard: "https://claude.ai/settings/usage" },
  codex: { name: "Codex", dashboard: "https://chatgpt.com/codex/cloud/settings/analytics#usage" },
};
const STALE = 0.55;

const levelColor = (lv, t) => (lv === "hot" ? t.ansi1 : lv === "warn" ? t.ansi3 : t.ansi2);

// A 4px track filled to `fill` percent in the color of `severity`, with a 1×8px tick
// at `tick` (0..1) when given.
function bar(width, fill, severity, tick, t) {
  return div().relative().w(width).h(4).rounded(2).bg(t.border).flex_none()
    .child(div().absolute().left(0).top(0).h(4).rounded(2).w(Math.round((width * Math.min(100, Math.max(0, fill))) / 100)).bg(levelColor(severity, t)))
    .when(tick !== null, (b) => b.child(div().absolute().top(-2).left(Math.round(width * tick)).w(1).h(8).bg(t.foreground).opacity(0.75)));
}

// A window as CodexBar draws it: the fill is what's left, draining, and the tick
// the share of its time left, so a fill short of its tick is using the window
// faster than the clock.
function windowBar(width, w, now, t) {
  const quota = level(w.used);
  const behind = deficit(w, now);
  const severity = quota === "hot" || behind > 15 ? "hot" : behind >= 10 ? "warn" : quota;
  return bar(width, 100 - w.used, severity, 1 - elapsed(w, now), t);
}

const tinted = (used, t) => (level(used) === "ok" ? t.foreground : levelColor(level(used), t));

// Every copy of the mod, in every window, shares one state (persisted by Herdr):
// { reading, due, wait, probing }. One probe at a time, claimed until `probing`;
// a new copy (a reload, a layout switch) shows the last reading at once and
// doesn't probe before `due`.
const KEY = "ai-usage";
const CLAIM = 70 * 1000; // longer than a probe's 60s timeout
const state = () => shared(KEY) ?? {};

export default class AiUsage extends View {
  init(_props, cx) {
    this.minute = 0;
    if (checking()) return;
    cx.timer.every(1000, (cx) => this.tick(cx));
    this.tick(cx);
  }

  tick(cx) {
    // Redraw once a minute, so ticks, countdowns and ages move between probes.
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    if (minute !== this.minute) {
      this.minute = minute;
      cx.notify();
    }
    const s = state();
    if (now < (s.due ?? 0) || now < (s.probing ?? 0)) return;
    setShared(KEY, { ...s, probing: now + CLAIM });
    // The accounts are the same everywhere, so one machine is read: this computer,
    // or the one the `machine` prop names.
    const on = props()?.machine ?? null;
    cx.spawn(async () => {
      let next = null;
      try {
        const r = await exec("sh", ["-c", PROBE], { on, timeout: 60000 });
        next = parse(r.stdout);
      } catch (_e) {
        // The machine is unreachable: the last reading stays, marked stale.
      }
      const done = Date.now();
      const last = state();
      const reading = merge(last.reading, next, done);
      const accounts = [reading.claude, reading.codex];
      const limited = accounts.some((p) => p?.stale === "429" || p?.pending === "429");
      const wait = limited ? Math.min(MAX_WAIT, (last.wait ?? EVERY / 2) * 2) : null;
      const fresh = accounts.some((p) => p?.at === done);
      setShared(KEY, {
        reading: reading.claude || reading.codex ? reading : null,
        due: done + (wait ?? (fresh ? EVERY : RETRY)),
        wait,
        probing: 0,
        history: record(last.history, reading, done),
      });
    });
  }

  refresh(cx) {
    setShared(KEY, { ...state(), due: 0 });
    this.tick(cx);
  }

  // The status-bar row. Per account: its name; per window its label, bar with
  // tick, percent left and, when `countdown` says so, the time to reset; then Claude's
  // `+$X` extra usage this month. A stale account is dimmed, one waiting for its
  // first answer shows "…", an unreadable one "!".
  summary(r, now, t) {
    const segment = (w) =>
      h_flex().gap(4).items_center().flex_none()
        .child(div().text_size(10.5).child(w.label))
        .child(windowBar(24, w, now, t))
        .child(div().text_color(tinted(w.used, t)).child(`${Math.round(100 - w.used)}%`))
        .when(countdown(w, now), (s) => s.child(div().child(until(w.resets, now))));
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
    // Resting on a line explains its tick.
    const windowLine = (key) => (w) =>
      line(w.name, windowBar(110, w, now, t),
        div().text_color(tinted(w.used, t)).child(`${Math.round(100 - w.used)}% left`),
        `${until(w.resets, now)} · ${clock(w.resets, now)}`)
        .id(`ai-usage-${key}-${w.label}`).tooltip(pace(w, now, recentRate(state().history?.[`${key}:${w.label}`])));
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
      if (a.pending) return s.child(small(`${reason(a.pending)}, retrying in ${until(state().due ?? now, now)}`));
      const why = a.stale === "offline" ? reason(a.stale) : `couldn't refresh: ${reason(a.stale)}`;
      s.child(small(`via ${a.via === "api" ? "API" : "CLI"} · updated ${ago(a.at, now)}${a.stale ? ` · ${why}` : ""}`));
      if (a.said) s.child(small(`${ACCOUNTS[key].name}'s pace: ${a.said}`));
      s.child(v_flex().gap(6).opacity(a.stale ? STALE : 1).children(a.windows.map(windowLine(key))));
      if (a.extra) {
        const share = (100 * a.extra.used) / a.extra.cap;
        s.child(line("Extra usage", bar(110, share, level(share), null, t),
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
    const busy = now < (state().probing ?? 0);
    const body = v_flex().id("ai-usage-panel-body").w(460).p(12).gap(10).rounded(8).border(1).border_color(t.border)
      .bg(t.popover).shadow_lg().text_size(12).text_color(t.foreground);
    ["claude", "codex"].filter((key) => r[key]).forEach((key, i) => {
      if (i > 0) body.child(rule());
      body.child(section(key));
    });
    return body.child(rule()).child(
      h_flex().justify_end().child(
        div().id("ai-usage-refresh").px(8).py(2).rounded(4).text_size(11).text_color(busy ? t.dim : t.muted)
          .when(!busy, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.refresh(cx)))
          .child(busy ? "↻ Refreshing…" : "↻ Refresh")));
  }

  // With a `fit` prop naming this block's id in the layout, the block takes the
  // width of what it shows: 0 when it shows nothing. A resize is window state, not
  // a change to the layout file.
  fit(width) {
    const id = props()?.fit;
    const px = Math.ceil(width);
    if (!id || px === this.fitted) return;
    this.fitted = px;
    run("layout.resize", { id, px });
  }

  render() {
    const t = theme();
    const now = Date.now();
    const root = h_flex().size_full().items_center().justify_end().overflow_hidden()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.dim);
    // Measured at its own width, even when the block is narrower.
    const content = h_flex().id("ai-usage-content").flex_none().items_center()
      .on_size_change((size) => this.fit(size.width));
    const r = state().reading;
    if (!r) return root.child(content);
    return root.child(content.px(14)
      .child(HoverCard.new("ai-usage-panel").anchor("bottom_right").open_delay(350).close_delay(300)
        .trigger(this.summary(r, now, t))
        .content(this.details(r, now, t))));
  }
}
