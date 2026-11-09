/**
 * The phone's channel drawer: the sidebar, slid in from the left.
 *
 * A class on <html> rather than component state, because three separately
 * mounted trees read it (the top bar's toggle, the sidebar, the scrim) and a
 * class is the one place all of them, and the stylesheet, can see.
 */

const OPEN = 'lobby-drawer-open';

export function isDrawerOpen(): boolean {
  return document.documentElement.classList.contains(OPEN);
}

export function openDrawer() {
  document.documentElement.classList.add(OPEN);
}

export function closeDrawer() {
  document.documentElement.classList.remove(OPEN);
}

export function toggleDrawer() {
  isDrawerOpen() ? closeDrawer() : openDrawer();
}
