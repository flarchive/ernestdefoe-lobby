import app from 'flarum/forum/app';

/**
 * The Online list's data, held OUTSIDE any component.
 *
 * 🚨 A widget is not mounted once. Bespoke rebuilds its zone hosts on every
 * redraw, so a list placed there is re-created each time anything on the page
 * changes; a component that fetched in `oninit` and redrew on the answer would
 * fetch, redraw, be rebuilt and fetch again without end. So the data, the
 * one timer and the one in-flight request live here, and every placement —
 * Lobby's own column, a Bespoke widget, a FoF widget — is a reader of it.
 */

export interface OnlineMember {
  id: number;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  color: string | null;
  hidden: boolean;
  activity: Record<string, any> | null;
}

export interface OnlineData {
  staff: OnlineMember[];
  members: OnlineMember[];
  total: number;
}

/** The server caches the list for a minute; asking more often is waste. */
const POLL = 60 * 1000;

let data: OnlineData | null = null;
let readers = 0;
let timer: number | null = null;
let inFlight: Promise<void> | null = null;

export function onlineData(): OnlineData | null {
  return data;
}

function load(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = app
    .request<OnlineData>({ method: 'GET', url: app.forum.attribute('apiUrl') + '/lobby/online' })
    .then((response) => {
      data = response;
    })
    .catch(() => {
      // Keep whatever was there; an empty list is not the same as "unknown".
      data ||= { staff: [], members: [], total: 0 };
    })
    .finally(() => {
      inFlight = null;
      m.redraw();
    });

  return inFlight;
}

function schedule() {
  if (timer !== null || readers === 0) return;

  timer = window.setTimeout(() => {
    timer = null;

    // A hidden tab does not poll; it catches up the moment it is seen.
    if (document.visibilityState === 'visible') load().then(schedule);
    else document.addEventListener('visibilitychange', resume);
  }, POLL);
}

function resume() {
  if (document.visibilityState !== 'visible') return;
  document.removeEventListener('visibilitychange', resume);
  if (readers > 0) load().then(schedule);
}

/** A placement is on screen. Refcounted: a remount is detach + attach. */
export function attach() {
  readers++;
  if (!data) load().then(schedule);
  else schedule();
}

export function detach() {
  readers = Math.max(0, readers - 1);

  // Only stop when the LAST reader leaves. A Bespoke remount is a detach
  // followed at once by an attach; stopping on the first would kill the
  // timer on every redraw.
  if (readers === 0 && timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

/**
 * Which hosts currently show the list.
 *
 * 🚨 Counted from real mounts, not from what is installed. A forum with
 * Bespoke installed and no Online widget placed must still get Lobby's own
 * column; standing it down because a host COULD show the list would show it
 * nowhere.
 */
const placements: Record<string, number> = {};
let announced = false;
let settling = false;

/**
 * Redraw only when the answer to "is it shown elsewhere?" actually changed,
 * and decide that after the current render pass. A Bespoke remount releases
 * and re-claims within one pass; redrawing on each half would make the
 * redraw that remounts it request another, for ever.
 */
function settle() {
  if (settling) return;
  settling = true;

  window.setTimeout(() => {
    settling = false;
    const now = live();

    if (now !== announced) {
      announced = now;
      m.redraw();
    }
  }, 0);
}

export function claim(host: string) {
  placements[host] = (placements[host] || 0) + 1;
  if (host !== 'lobby') settle();
}

export function release(host: string) {
  placements[host] = Math.max(0, (placements[host] || 0) - 1);
  if (host !== 'lobby') settle();
}

function live(): boolean {
  return Object.keys(placements).some((host) => host !== 'lobby' && placements[host] > 0);
}

/** The settled answer, stable for the length of a render pass. */
export function placedElsewhere(): boolean {
  return announced;
}
