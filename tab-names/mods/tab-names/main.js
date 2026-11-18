import { View, div } from "gpui-kit";
import { terminals, panes, spaces, machines, run, shared, setShared, checking } from "herdr";

// Lets a program name its tab from any machine: a terminal labelled
// tab.name=<name> (`hc label <terminal> tab.name=<name>`) gets its tab renamed
// to <name>. A tab no label names takes the title of its first agent pane: for
// Claude Code its session name (`-n`, `/rename`). Once per value, so a rename made
// later in the app stays.
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
    const shown = panes().filter((p) => p.terminal);
    const tabOf = new Map(shown.map((p) => [p.terminal, p.tab]));
    // Keep what was given on machines whose terminals aren't known right now (offline),
    // so their labels don't rename again when they come back.
    const ready = new Set(machines().filter((m) => m.layout === "ready").map((m) => m.name ?? ""));
    const next = Object.fromEntries(Object.entries(given).filter(([a]) => !ready.has(machineOf(a))));
    const labelled = new Set(); // tabs a label names
    for (const t of terminals()) {
      const name = t.labels?.[LABEL];
      if (!name) continue;
      const tab = tabOf.get(t.address);
      if (tab) labelled.add(tab);
      if (given[t.address] !== name) {
        if (!tab) continue; // no pane yet: try again on the next tick
        run("tab.rename", { id: tab, name });
      }
      next[t.address] = name;
    }
    // The title fallback: only a tab nobody named, or one this mod named from that
    // pane's previous title, so a hand rename stays. Codex appends " | <worktree>".
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const titled = new Set();
    for (const p of shown) {
      if (!p.app || titled.has(p.tab)) continue;
      titled.add(p.tab);
      const tab = tabs.get(p.tab);
      const name = p.title?.split(" | ")[0].trim();
      if (labelled.has(p.tab) || !tab || !name) continue;
      const mine = given[p.terminal];
      if (mine !== name && (!tab.named || tab.name === mine)) run("tab.rename", { id: p.tab, name });
      next[p.terminal] = name;
    }
    if (JSON.stringify(next) !== JSON.stringify(given)) setShared(KEY, next);
  }

  render() {
    return div();
  }
}
