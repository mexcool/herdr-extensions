import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, spaces, theme, checking, props, run } from "herdr";
import { PROBE, parse, coresBetween } from "./probe.js";

const EVERY = 5000;

const activeMachine = () => spaces().find((s) => s.active)?.machine ?? null;

export default class PodStats extends View {
  init(_props, cx) {
    // The last reading per machine (null: this computer), so a space switch shows
    // that machine's numbers at once and never another machine's.
    this.readings = new Map();
    this.busy = false;
    this.probed = undefined; // the machine of the latest probe
    this.due = 0;
    if (checking()) return;
    // Cheap: reads the app's own state. A probe only runs when one is due or the
    // active space is on another machine than the latest probe.
    cx.timer.every(250, (cx) => this.tick(cx));
    this.tick(cx);
  }

  tick(cx) {
    const on = activeMachine();
    if (this.busy || (on === this.probed && Date.now() < this.due)) return;
    this.busy = true;
    this.probed = on;
    cx.spawn(async (cx) => {
      let next = null;
      try {
        const r = await exec("sh", ["-c", PROBE], { on, timeout: 5000 });
        // No cgroup v2 there (a Mac): show nothing.
        if (r.code === 0) next = { ...parse(r.stdout), at: Date.now() };
      } catch (_e) {
        // The machine is unreachable: show nothing.
      }
      const prev = this.readings.get(on);
      // CPU needs a recent earlier reading. Without one, keep the last value and
      // take the second reading in a second instead of in EVERY.
      const recent = next && prev && next.at - prev.at < 3 * EVERY;
      if (next) next.cpu = recent ? coresBetween(prev, next) : (prev?.cpu ?? null);
      if (next) this.readings.set(on, next);
      else this.readings.delete(on);
      this.busy = false;
      this.due = Date.now() + (next && !recent ? 1000 : EVERY);
      cx.notify();
    });
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
    const root = h_flex().size_full().items_center().justify_end().overflow_hidden()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.dim);
    // Measured at its own width, even when the block is narrower.
    const bar = h_flex().id("pod-stats-content").flex_none().gap(16).items_center()
      .on_size_change((size) => this.fit(size.width));
    const s = this.readings.get(activeMachine());
    if (!s) return root.child(bar);
    const item = (label, used, limit, text) => {
      const share = used / limit;
      const color = share >= 0.9 ? t.ansi1 : share >= 0.75 ? t.ansi3 : t.foreground;
      return h_flex().gap(5).child(label).child(div().text_color(color).child(text));
    };
    const cores = `/${+s.cores.toFixed(2)}`;
    const memMax = Number.isFinite(s.memMax) ? `/${s.memMax.toFixed(0)}` : "";
    return root.child(bar.px(14)
      .child(s.cpu === null ? item("cpu", 0, 1, `–${cores}`) : item("cpu", s.cpu, s.cores, `${s.cpu.toFixed(1)}${cores}`))
      .child(item("mem", s.mem, s.memMax, `${s.mem.toFixed(1)}${memMax}G`))
      .child(item("disk", s.disk, s.diskMax, `${s.disk.toFixed(0)}/${s.diskMax.toFixed(0)}G`)));
  }
}
