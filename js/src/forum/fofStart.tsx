import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import IndexPage from 'flarum/forum/components/IndexPage';
import PageStructure from 'flarum/forum/components/PageStructure';

/**
 * fof/forum-widgets-core's two left-hand sections ("start top" and "start
 * bottom"). It puts them in core's page sidebar, which Lobby hides on the
 * index: the channels are Lobby's own sidebar. So they are drawn there instead,
 * above and below the channel list (and so in the phone's drawer too).
 *
 * 🚨 Not a build-time dependency: resolved at RUNTIME through the registry,
 * so nothing changes without widget-core, or with a version whose modules
 * moved. Each section draws nothing until an operator places a widget in it.
 */
const SECTIONS = {
  top: { item: 'startTopWidgetSection', module: 'forum/components/StartTopWidgetSection' },
  bottom: { item: 'startBottomWidgetSection', module: 'forum/components/StartBottomWidgetSection' },
};

type Which = keyof typeof SECTIONS;

function resolve(which: Which): any {
  const flarum = typeof globalThis !== 'undefined' ? (globalThis as any).flarum : undefined;
  if (!flarum?.extensions || !('fof-forum-widgets-core' in flarum.extensions)) return null;

  try {
    const mod = flarum.reg?.get?.('fof-forum-widgets-core', SECTIONS[which].module);
    return mod?.default ?? mod ?? null;
  } catch (e) {
    return null;
  }
}

/** The section, for Lobby's sidebar; null without widget-core. */
export function fofStartSection(which: Which) {
  const Section = resolve(which);

  return Section ? <Section /> : null;
}

/**
 * Take the sections out of core's (hidden) page sidebar on the index, so each
 * widget is mounted once — in Lobby's sidebar — and not a second time out of
 * sight. Left in place when Lobby cannot draw them itself.
 */
export default function installFofStart() {
  extend(PageStructure.prototype, 'sidebarItems', function (items) {
    if (!app.current.matches(IndexPage)) return;

    (Object.keys(SECTIONS) as Which[]).forEach((which) => {
      const { item } = SECTIONS[which];
      if (items.has(item) && resolve(which)) items.remove(item);
    });
  });
}
