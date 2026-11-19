// Plan usage of the Claude Code and Codex accounts signed in on a machine: the
// one place that knows where the numbers come from. CodexBar's approach, for
// both accounts:
//
// 1. The account's own usage API, with the OAuth token its CLI saved. Only the
//    token itself is read (Claude's credentials also hold one per MCP server
//    signed in), it reaches curl on stdin, never a command line, and nothing
//    refreshes it, redeems anything or writes a credential file.
// 2. The CLI, only when there is no token or the API refuses it (401/403). The
//    CLI owns its login, so it also refreshes an expired token, and the next
//    probe's API call works again. It gives the windows only.
// 3. Anything else (429, 5xx, no network): "stale", and the last reading stays.
//
// PROBE prints a `--- claude` and a `--- codex` section. Each starts with what
// answered (`api`, `cli`), `stale <HTTP status>` or `failed`, and is empty when
// the machine has neither a token nor the CLI. `--- claude.plan` and
// `--- codex.resets` carry the plan from Claude's credentials and Codex's reset
// credits.
export const PROBE = String.raw`
field() { # $1.$2 of the JSON on stdin, from inside the $1 object only
  tr -d '\n' | sed -n "s/.*\"$1\" *: *{[^}]*\"$2\" *: *\"\([^\"]*\)\".*/\1/p"
}
get() { # GET $1 with the headers on stdin: the body, then the HTTP status on its own line
  curl -sS --max-time 10 -H @- -w '\n%{http_code}' "$1" 2>/dev/null
}
status() { printf '%s\n' "$1" | tail -n 1; }
report() { # $1: the API's answer, or "none" with no token; $2: the CLI, $3: its probe
  code=none
  [ "$1" = none ] || code=$(status "$1")
  case $code in
    200) echo api; printf '%s\n' "$1" | sed '$d' ;;
    none | 401 | 403)
      if command -v "$2" >/dev/null; then
        if reply=$($3); then echo cli; echo "$reply"; else echo failed; fi
      elif [ "$code" != none ]; then echo failed; fi ;;
    *) echo "stale $code" ;;
  esac
}

claude_creds() {
  f="$HOME/.claude/.credentials.json"
  [ -n "$CLAUDE_CONFIG_DIR" ] && f="$CLAUDE_CONFIG_DIR/.credentials.json"
  if [ -r "$f" ]; then cat "$f"
  elif command -v security >/dev/null; then security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null
  fi
}
claude_get() { # $1: the query string
  printf 'Authorization: Bearer %s\nanthropic-beta: oauth-2025-04-20\nUser-Agent: claude-cli/%s (external, cli)\n' "$token" "$version" |
    get "https://api.anthropic.com/api/oauth/usage$1"
}
claude_cli() { # one get_usage control request, no prompt; safe mode, no hooks, MCP or Remote Control
  d=$(mktemp -d)
  printf '%s\n' '{"type":"control_request","request_id":"ai-usage","request":{"subtype":"get_usage","skip_behaviors":true}}' >"$d/in"
  claude -p --safe-mode --no-session-persistence --strict-mcp-config \
    --settings '{"remoteControlAtStartup":false,"disableAllHooks":true}' \
    --input-format stream-json --output-format stream-json --verbose <"$d/in" >"$d/out" 2>/dev/null &
  pid=$!
  i=0
  while [ "$i" -lt 75 ] && ! grep -q '"control_response"' "$d/out" && kill -0 "$pid" 2>/dev/null; do
    sleep 0.2; i=$((i + 1))
  done
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  grep -m1 '"control_response"' "$d/out"; found=$?
  rm -rf "$d"
  return "$found"
}
codex_get() { # $1: the path under wham/
  {
    printf 'Authorization: Bearer %s\nUser-Agent: codex-cli\n' "$token"
    if [ -n "$account" ]; then printf 'ChatGPT-Account-Id: %s\n' "$account"; fi
  } | get "https://chatgpt.com/backend-api/wham/$1"
}
codex_cli() { # app-server quits at the end of its input before it answers: hold it open until it has
  d=$(mktemp -d)
  {
    printf '%s\n' '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"ai-usage","version":"1"}}}' \
      '{"method":"initialized"}' '{"id":2,"method":"account/rateLimits/read"}'
    i=0
    while [ ! -e "$d/done" ] && [ "$i" -lt 150 ]; do sleep 0.1; i=$((i + 1)); done
  } | codex app-server 2>/dev/null | {
    while IFS= read -r line; do
      case $line in '{"id":2,'*) echo "$line"; break ;; esac
    done
    touch "$d/done"
  } >"$d/reply"
  cat "$d/reply"; [ -s "$d/reply" ]; found=$?
  rm -rf "$d"
  return "$found"
}

creds=$(claude_creds)
token=$(printf '%s' "$creds" | field claudeAiOauth accessToken)
answer=none
if [ -n "$token" ]; then
  version=$(claude --version 2>/dev/null | cut -d' ' -f1)
  [ -n "$version" ] || version=2.0.0
  # cedar_ember adds the saved resets; without it if the server won't take it.
  answer=$(claude_get '?cedar_ember=1')
  case $(status "$answer") in 400 | 403) answer=$(claude_get '') ;; esac
fi
echo "--- claude"
report "$answer" claude claude_cli
echo "--- claude.plan"
printf '%s' "$creds" | field claudeAiOauth subscriptionType
echo

home=$CODEX_HOME
[ -n "$home" ] || home=$HOME/.codex
token=$(field tokens access_token <"$home/auth.json" 2>/dev/null)
account=$(field tokens account_id <"$home/auth.json" 2>/dev/null)
answer=none
[ -n "$token" ] && answer=$(codex_get usage)
echo "--- codex"
report "$answer" codex codex_cli
if [ -n "$token" ]; then
  # Best effort: the list of reset credits, for their expiry.
  resets=$(codex_get rate-limit-reset-credits)
  echo "--- codex.resets"
  [ "$(status "$resets")" = 200 ] && printf '%s\n' "$resets" | sed '$d'
fi
true`;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// { claude, codex }, each:
// - null: not on that machine;
// - { stale: status }: the API didn't answer, so keep the last reading;
// - { error: true }: no reading to be had;
// - { via: "api" | "cli", plan, windows: [{ label, name, used, resets, length }], resets, extra, credits }:
//   used in percent, times in ms. From the API only: `resets` { left, next } (saved
//   resets, reset credits), Claude's `extra` { used, cap, currency } (extra usage this
//   month) and Codex's `credits` { unlimited, balance }.
export function parse(out, now = Date.now()) {
  const section = (name) => out.split(/^--- /m).find((part) => part.startsWith(`${name}\n`))?.slice(name.length + 1).trim();
  const json = (text) => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  };
  const claude = provider(section("claude"), claudeWindows);
  if (claude?.windows) {
    const data = claude.data;
    claude.plan = section("claude.plan") || data?.response?.response?.subscription_type || null;
    const limits = claude.via === "cli" ? data?.response?.response?.rate_limits : data;
    claude.said = said(limits?.pace) ?? said(limits?.indicator);
    if (claude.via === "api") {
      claude.resets = savedResets(data.cedar_ember, now);
      claude.extra = extraUsage(data.extra_usage);
    }
  }
  const codex = provider(section("codex"), codexWindows);
  if (codex?.windows && codex.via === "api") {
    const data = codex.data;
    codex.plan = data.plan_type ? data.plan_type.replace(/_/g, " ") : null;
    codex.credits = data.credits?.has_credits ? { unlimited: Boolean(data.credits.unlimited), balance: data.credits.balance ?? null } : null;
    codex.resets = resetCredits(json(section("codex.resets")), data.rate_limit_reset_credits, now);
  }
  for (const p of [claude, codex]) if (p) delete p.data;
  return { claude, codex };
}

function provider(text, windowsOf) {
  if (!text) return null;
  const [tag, ...rest] = text.split("\n");
  const [via, status] = tag.split(" ");
  if (via === "stale") return { stale: status };
  if (via !== "api" && via !== "cli") return { error: true };
  try {
    const data = JSON.parse(rest.join("\n"));
    const windows = windowsOf(data, via);
    return windows.length ? { via, windows, data } : { error: true };
  } catch {
    return { error: true };
  }
}

function claudeWindows(data, via) {
  const limits = via === "cli" ? data?.response?.response?.rate_limits : data;
  // `limits` names every window, model-scoped weekly ones included; older replies
  // only have five_hour and seven_day.
  if (Array.isArray(limits?.limits)) {
    return limits.limits.map((l) => {
      const model = l.scope?.model?.display_name;
      const session = l.kind === "session";
      return {
        label: session ? "5h" : (model ?? "7d"),
        name: session ? "5-hour" : model ? `Weekly · ${model}` : "Weekly",
        used: l.percent,
        resets: Date.parse(l.resets_at),
        length: session ? 5 * HOUR : 7 * DAY,
      };
    });
  }
  return [["5h", "5-hour", limits?.five_hour, 5 * HOUR], ["7d", "Weekly", limits?.seven_day, 7 * DAY]]
    .filter(([, , w]) => w)
    .map(([label, name, w, length]) => ({ label, name, used: w.utilization, resets: Date.parse(w.resets_at), length }));
}

function codexWindows(data, via) {
  // The primary window is 5h or weekly depending on the plan; secondary may be absent.
  const windows = via === "cli"
    ? [data?.result?.rateLimits?.primary, data?.result?.rateLimits?.secondary].filter(Boolean)
        .map((w) => ({ used: w.usedPercent, resets: w.resetsAt * 1000, mins: w.windowDurationMins }))
    : [data?.rate_limit?.primary_window, data?.rate_limit?.secondary_window].filter(Boolean)
        .map((w) => ({ used: w.used_percent, resets: w.reset_at * 1000, mins: w.limit_window_seconds / 60 }));
  return windows.map(({ used, resets, mins }) => {
    const label = mins % 1440 === 0 ? `${mins / 1440}d` : `${Math.round(mins / 60)}h`;
    return { label, name: mins === 10080 ? "Weekly" : mins === 300 ? "5-hour" : label, used, resets, length: mins * 60 * 1000 };
  });
}

// Claude's own pace, if its reply carries one: `pace` and `indicator` are there but
// empty so far, and their shape unknown. A string, or the first text field of an
// object, else null.
function said(v) {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") return ["message", "label", "text", "summary", "status"].map((k) => v[k]).find((x) => typeof x === "string" && x.trim()) ?? null;
  return null;
}

// Claude's saved resets ("Reset for free" in its usage settings): the resets left in
// the grants that are on now (started, not ended, not paused). A grant with an
// unreadable field drops out, since every comparison with NaN is false.
function savedResets(ce, now) {
  if (ce?.eligible !== true || !Array.isArray(ce.grants)) return null;
  const on = ce.grants.filter((g) => Number.isInteger(g.resets_left) && g.paused === false
    && Date.parse(g.starts_at) <= now && now < Date.parse(g.ends_at));
  const ends = on.filter((g) => g.resets_left > 0).map((g) => Date.parse(g.ends_at));
  return { left: on.reduce((n, g) => n + g.resets_left, 0), next: ends.length ? Math.min(...ends) : null };
}

// Claude's extra usage this month, in the currency's units.
function extraUsage(e) {
  if (e?.is_enabled !== true || typeof e.used_credits !== "number" || typeof e.monthly_limit !== "number") return null;
  const unit = 10 ** (e.decimal_places ?? 2);
  return { used: e.used_credits / unit, cap: e.monthly_limit / unit, currency: e.currency ?? "USD" };
}

// Codex's reset credits: the available ones in the list, else the count in its usage reply.
function resetCredits(list, summary, now) {
  if (Array.isArray(list?.credits)) {
    const on = list.credits.filter((c) => c.status === "available" && !(Date.parse(c.expires_at) <= now));
    const ends = on.map((c) => Date.parse(c.expires_at)).filter(Number.isFinite);
    return { left: on.length, next: ends.length ? Math.min(...ends) : null };
  }
  return Number.isInteger(summary?.available_count) ? { left: summary.available_count, next: null } : null;
}

// What to show after a probe: fresh windows replace the last ones; a stale answer,
// or no answer at all (`next` null: the machine is unreachable), keeps the last
// reading, marked stale, or with nothing to keep waits (`pending`) for the retry;
// an error shows "!". Each account keeps when it was read (`at`).
export function merge(prev, next, now) {
  const out = {};
  for (const key of ["claude", "codex"]) {
    const p = prev?.[key] ?? null;
    const n = next ? next[key] : p && { stale: "offline" };
    if (!n) out[key] = null;
    else if (n.windows) out[key] = { ...n, at: now };
    else if (n.stale && p?.windows) out[key] = { ...p, stale: n.stale };
    else if (n.stale) out[key] = { pending: n.stale };
    else out[key] = { error: true };
  }
  return out;
}

// "ok", "warn" from 75% used, "hot" from 90%: the same steps as pod-stats.
export const level = (used) => (used >= 90 ? "hot" : used >= 75 ? "warn" : "ok");

// The share of the window's time that has passed, 0..1: the pace tick.
export const elapsed = (w, now) => Math.min(1, Math.max(0, 1 - (w.resets - now) / w.length));

// How many points use is ahead of the time gone (CodexBar's even-consumption
// pace): positive in deficit, negative in reserve. 0 before 3% of the window has
// passed or anything is used, when there's no pace to tell.
export function deficit(w, now) {
  const gone = elapsed(w, now);
  return gone < 0.03 || w.used <= 0 ? 0 : Math.round(w.used - 100 * gone);
}

// Whether the bar shows a window's time to reset: always for a 5-hour window;
// for the others once amber or red, or in deficit with 75% or less left.
export function countdown(w, now) {
  return w.length === 5 * HOUR || level(w.used) !== "ok" || (w.used >= 25 && deficit(w, now) > 0);
}

// The last hour of a 5-hour window's readings, for its recent rate: per
// "<account>:<label>", [read at, % used, resets at] from each fresh reading. A
// window that reset (use went down, or its reset time moved) starts over. Weekly
// windows keep none: an hour's rate stretched over days says little.
export function record(history, reading, now) {
  const out = {};
  for (const key of ["claude", "codex"]) {
    const a = reading?.[key];
    const fresh = a?.windows && !a.stale && a.at === now;
    for (const [k, points] of Object.entries(history ?? {})) {
      if (k.startsWith(`${key}:`) && !fresh) out[k] = points;
    }
    if (!fresh) continue;
    for (const w of a.windows.filter((w) => w.length === 5 * HOUR)) {
      const k = `${key}:${w.label}`;
      let points = (history?.[k] ?? []).filter(([at]) => now - at <= HOUR);
      const last = points[points.length - 1];
      if (last && (w.used < last[1] || Math.abs(w.resets - last[2]) > 10 * 60 * 1000)) points = [];
      out[k] = [...points, [now, w.used, w.resets]];
    }
  }
  return out;
}

// The recent rate, in % per ms, from a least-squares line through the readings:
// only with at least 6 readings over 30 minutes or more, in which use rose by 3
// points or more, so the whole-percent rounding of each reading can't swing it.
// Otherwise null, and the average rate since the window started is used.
export function recentRate(points) {
  if (!points || points.length < 6) return null;
  const span = points[points.length - 1][0] - points[0][0];
  if (span < 30 * 60 * 1000) return null;
  const mt = points.reduce((s, [at]) => s + at, 0) / points.length;
  const mu = points.reduce((s, [, u]) => s + u, 0) / points.length;
  const cov = points.reduce((s, [at, u]) => s + (at - mt) * (u - mu), 0);
  const v = points.reduce((s, [at]) => s + (at - mt) ** 2, 0);
  const slope = cov / v;
  return slope * span >= 3 ? slope : null;
}

// What a window's tick means, with that pace, and when its use would run out:
// at `rate` (% per ms, the recent rate) when given, else at the average rate so
// far. No pace part when there's none to tell.
export function pace(w, now, rate = null) {
  const gone = elapsed(w, now);
  const tick = `Tick: ${Math.round(100 * (1 - gone))}% of this window's time is left.`;
  if (gone < 0.03 || w.used <= 0) return tick;
  if (w.used >= 100) return `${tick} Used up until it resets.`;
  const delta = deficit(w, now);
  const where = delta === 0 ? "On pace" : delta < 0 ? `${-delta}% in reserve` : `${delta}% in deficit`;
  const runsOut = rate ? (100 - w.used) / rate : ((100 - w.used) * gone * w.length) / w.used;
  const basis = rate ? " at the last hour's rate" : "";
  const when = now + runsOut < w.resets ? `runs out in ${until(now + runsOut, now)}` : "lasts until reset";
  return `${tick} ${where}: ${when}${basis}.`;
}

// Claude doesn't say when extra usage resets; like CodexBar, assume the 1st of next month, 00:00 UTC.
export function nextMonth(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

// "$42", or "$42.10" with `cents`; other currencies by their code.
export function money(x, currency, cents = false) {
  const n = cents ? x.toFixed(2) : String(Math.round(x));
  return currency === "USD" ? `$${n}` : `${n} ${currency}`;
}

// "2d 10h", "4h 26m", "38m": how long until `ms`.
export function until(ms, now) {
  const m = Math.max(0, Math.round((ms - now) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "18:00" within a day, else "Wed 06:00", in local time. Resets land a fraction of
// a second before the minute, so round to it.
export function clock(ms, now) {
  const d = new Date(Math.round(ms / 60000) * 60000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return ms - now < DAY ? hm : `${DAYS[d.getDay()]} ${hm}`;
}

// "Jan 20", in local time.
export function date(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// "just now", "4m ago", "2h ago".
export function ago(ms, now) {
  const m = Math.floor((now - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}
