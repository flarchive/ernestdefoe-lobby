import app from 'flarum/forum/app';

/**
 * "Since your last visit", kept in the reader's own browser.
 *
 * 🚨 Nothing here touches the server. Core has no notion of a previous visit:
 * `last_seen_at` is rewritten every few minutes while somebody reads, so by
 * the time a page renders it says "just now". A visit is therefore tracked
 * where it happens — a gap of half an hour or more starts a new one, and the
 * start of the visit before it is the line the divider and the channel dots
 * are drawn against. A guest gets the same as a member, for free.
 *
 * Storage can be missing or throw (private windows, blocked site data); every
 * access is guarded and the theme simply shows no divider and no dots then.
 */

const KEY = 'lobby.visits';
const GAP = 30 * 60 * 1000;

interface Visits {
  /** When this browser last saw the forum. */
  last: number;
  /** When the visit before this one ended: the "since" line. */
  prev: number;
  /** Per channel, when the reader last opened it. */
  seen: Record<string, number>;
}

let state: Visits = { last: 0, prev: 0, seen: {} };
let bootedAt = 0;

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // Storage unavailable: the visit simply is not remembered.
  }
}

export function bootVisits() {
  const now = Date.now();
  bootedAt = now;

  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && typeof parsed === 'object') {
      state = {
        last: Number(parsed.last) || 0,
        prev: Number(parsed.prev) || 0,
        seen: parsed.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
      };
    }
  } catch (e) {
    // Unreadable or corrupt: start over.
  }

  if (state.last && now - state.last > GAP) {
    state.prev = state.last;
  }

  // Forget channels nobody has opened for a month, so the record cannot grow
  // without bound on a forum with many tags.
  for (const id in state.seen) {
    if (now - state.seen[id] > 30 * 24 * 3600 * 1000) delete state.seen[id];
  }

  touch();

  // Keep `last` current while the tab is open, so leaving for lunch and
  // coming back counts as a new visit and a long read does not.
  window.setInterval(() => document.visibilityState === 'visible' && touch(), 60 * 1000);
}

function touch() {
  state.last = Date.now();
  save();
}

/**
 * The "since" line: when the previous visit ended, or no line at all on a
 * first visit (everything would be "new", which says nothing).
 */
export function since(): number {
  const markedAll = app.session.user?.markedAllAsReadAt()?.getTime() || 0;

  return state.prev ? Math.max(state.prev, markedAll) : 0;
}

export function markChannelSeen(id: string) {
  state.seen[id] = Date.now();
  save();
}

/** Opened during this page's life: its mention badge has been looked at. */
export function seenThisSession(id: string): boolean {
  return (state.seen[id] || 0) >= bootedAt;
}

/**
 * Something was posted in this channel after the reader last looked: after
 * the previous visit, after they marked everything read, and after they last
 * opened the channel itself.
 */
export function channelUnread(tag: any): boolean {
  const posted = tag.lastPostedAt?.()?.getTime?.() || 0;
  if (!posted || !state.prev) return false;

  return posted > Math.max(since(), state.seen[tag.id()] || 0);
}
