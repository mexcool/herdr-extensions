import { View, div } from "gpui-kit";
import { terminals, panes, machines, run, shared, setShared, checking } from "herdr";

// Lets a program name its tab from any machine: a terminal labelled
// tab.name=<name> (`hc label <terminal> tab.name=<name>`) gets its tab renamed
// to <name>. Once per value, so a rename made later in the app stays.
const LABEL = "tab.name";
const KEY = "tab-names"; // shared: { <terminal address>: <name it was given> }

const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : "");

export default class TabNames extends View {
  init(_props, cx) {
    if (checking()) return;
    cx.timer.every(1000, () => this.tick());
    this.tick();
  }

  tick() {
    const given = shared(KEY) ?? {};
    const tabOf = new Map(panes().filter((p) => p.terminal).map((p) => [p.terminal, p.tab]));
    // Keep what was given on machines whose terminals aren't known right now (offline),
    // so their labels don't rename again when they come back.
    const ready = new Set(machines().filter((m) => m.layout === "ready").map((m) => m.name ?? ""));
    const next = Object.fromEntries(Object.entries(given).filter(([a]) => !ready.has(machineOf(a))));
    for (const t of terminals()) {
      const name = t.labels?.[LABEL];
      if (!name) continue;
      const tab = tabOf.get(t.address);
      if (given[t.address] !== name) {
        if (!tab) continue; // no pane yet: try again on the next tick
        run("tab.rename", { id: tab, name });
      }
      next[t.address] = name;
    }
    if (JSON.stringify(next) !== JSON.stringify(given)) setShared(KEY, next);
  }

  render() {
    return div();
  }
}
