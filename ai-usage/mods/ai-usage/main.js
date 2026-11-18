import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, spaces, theme, checking } from "herdr";
import { PROBE, parse, until } from "./probe.js";

// Plan windows move slowly, and Anthropic's endpoint throttles frequent polling.
const EVERY = 5 * 60 * 1000;
const RETRY = 60 * 1000;

const activeMachine = () => spaces().find((s) => s.active)?.machine ?? null;

export default class AiUsage extends View {
  init(_props, cx) {
    // The last reading and the next probe per machine (null: this computer), so
    // a space switch shows that machine's accounts at once, and probes only a
    // machine it hasn't read in EVERY.
    this.readings = new Map();
    this.due = new Map();
    this.busy = false;
    if (checking()) return;
    cx.timer.every(1000, (cx) => this.tick(cx));
    this.tick(cx);
  }

  tick(cx) {
    const on = activeMachine();
    if (this.busy || Date.now() < (this.due.get(on) ?? 0)) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      let next = null;
      try {
        const r = await exec("sh", ["-c", PROBE], { on, timeout: 30000 });
        next = parse(r.stdout);
      } catch (_e) {
        // The machine is unreachable.
      }
      // An account that can't be read is hidden, like the rest of the bar when neither can.
      const read = next && (next.claude || next.codex);
      if (read) this.readings.set(on, next);
      else this.readings.delete(on);
      this.due.set(on, Date.now() + (read ? EVERY : RETRY));
      this.busy = false;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const bar = h_flex().size_full().px(14).gap(16).items_center().justify_end()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.dim);
    const r = this.readings.get(activeMachine());
    if (!r) return bar;
    const color = (left) => (left <= 10 ? t.ansi1 : left <= 25 ? t.ansi3 : t.foreground);
    const group = (name, windows) =>
      windows.reduce(
        (g, w) => g.child(h_flex().gap(4).child(w.label).child(div().text_color(color(w.left)).child(`${Math.round(w.left)}%`))),
        h_flex().gap(8).child(name),
      ).tooltip(`${name}: % of each window left · ${windows.map((w) => `${w.label} resets in ${until(w.resets)}`).join(" · ")}`);
    return [["claude", r.claude], ["codex", r.codex]]
      .filter(([, windows]) => windows)
      .reduce((b, [name, windows]) => b.child(group(name, windows)), bar);
  }
}
