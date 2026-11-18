import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, spaces, theme, checking, props, run, shared, setShared } from "herdr";
import { PROBE, parse, coresBetween } from "./probe.js";

const EVERY = 5000;

const activeMachine = () => spaces().find((s) => s.active)?.machine ?? null;

// Every copy of the mod, in every window, shares the readings (persisted by
// Herdr): { [machine]: { reading, due, probing } }, "" for this computer. Each
// machine is probed by one copy at a time, claimed until `probing`, and a new copy
// (a reload, a layout switch) shows its last numbers at once.
const KEY = "pod-stats";
const CLAIM = 10 * 1000; // longer than a probe's 5s timeout
const keyOf = (machine) => machine ?? "";
const machines = () => shared(KEY) ?? {};

export default class PodStats extends View {
  init(_props, cx) {
    if (checking()) return;
    // Cheap: reads the app's own state. A probe runs only when the active space's
    // machine is due: a switch to a machine not read for EVERY probes at once.
    cx.timer.every(250, (cx) => this.tick(cx));
    this.tick(cx);
  }

  tick(cx) {
    const on = activeMachine();
    const key = keyOf(on);
    const now = Date.now();
    const all = machines();
    const m = all[key] ?? {};
    if (now < (m.due ?? 0) || now < (m.probing ?? 0)) return;
    setShared(KEY, { ...all, [key]: { ...m, probing: now + CLAIM } });
    cx.spawn(async () => {
      let next = null;
      try {
        const r = await exec("sh", ["-c", PROBE], { on, timeout: 5000 });
        // No cgroup v2 there (a Mac): show nothing.
        if (r.code === 0) next = { ...parse(r.stdout), at: Date.now() };
      } catch (_e) {
        // The machine is unreachable: show nothing.
      }
      const latest = machines();
      const prev = latest[key]?.reading;
      // CPU needs a recent earlier reading. Without one, keep the last value and
      // take the second reading in a second instead of in EVERY.
      const recent = next && prev && next.at - prev.at < 3 * EVERY;
      if (next) next.cpu = recent ? coresBetween(prev, next) : (prev?.cpu ?? null);
      setShared(KEY, { ...latest, [key]: { reading: next, due: Date.now() + (next && !recent ? 1000 : EVERY), probing: 0 } });
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
    const bar = h_flex().id("pod-stats-content").flex_none().gap(14).items_center()
      .on_size_change((size) => this.fit(size.width));
    const s = machines()[keyOf(activeMachine())]?.reading;
    if (!s) return root.child(bar);
    // With the `divider` prop, a 1×14px divider closes it on the right, setting it
    // apart from the block after it. Only while it shows something.
    const item = (label, used, limit, text) => {
      const share = used / limit;
      const color = share >= 0.9 ? t.ansi1 : share >= 0.75 ? t.ansi3 : t.foreground;
      return h_flex().gap(5).child(label).child(div().text_color(color).child(text));
    };
    const cores = `/${+s.cores.toFixed(2)}`;
    const memMax = Number.isFinite(s.memMax) ? `/${s.memMax.toFixed(0)}` : "";
    const divider = Boolean(props()?.divider);
    return root.child(bar.pl(14).when(!divider, (b) => b.pr(14))
      .child(h_flex().gap(16).items_center()
        .child(s.cpu === null ? item("cpu", 0, 1, `–${cores}`) : item("cpu", s.cpu, s.cores, `${s.cpu.toFixed(1)}${cores}`))
        .child(item("mem", s.mem, s.memMax, `${s.mem.toFixed(1)}${memMax}G`))
        .child(item("disk", s.disk, s.diskMax, `${s.disk.toFixed(0)}/${s.diskMax.toFixed(0)}G`)))
      .when(divider, (b) => b.child(div().w(1).h(14).bg(t.border).flex_none())));
  }
}
