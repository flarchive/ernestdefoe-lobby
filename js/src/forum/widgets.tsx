import app from 'flarum/forum/app';

import OnlineList, { onlineEnabled } from './components/OnlineList';

/**
 * The Online list as a widget, for Bespoke and for fof/forum-widgets-core.
 *
 * 🚨 Neither host is a build-time dependency. Each is resolved at RUNTIME
 * through its own registry, so the bundle is the same with both installed or
 * neither, and a host that is missing cannot break the forum's JS.
 *
 * 🚨 Registering is not placing. Lobby's own column keeps showing the list
 * until a host has actually MOUNTED it (see onlineStore's claims).
 */

function flarumGlobal(): any {
  return typeof globalThis !== 'undefined' ? (globalThis as any).flarum : undefined;
}

export default function registerOnlineWidgets() {
  registerFof();
  registerBespoke();
}

/**
 * fof/forum-widgets-core — package `fof/forum-widgets-core`, extension id
 * `fof-forum-widgets-core` (not the older `fof/widgets-core`).
 */
function registerFof() {
  const flarum = flarumGlobal();
  if (!flarum?.extensions || !('fof-forum-widgets-core' in flarum.extensions)) return;

  const widgetsMod = flarum.reg?.get?.('fof-forum-widgets-core', 'common/extend/Widgets');
  const widgetMod = flarum.reg?.get?.('fof-forum-widgets-core', 'common/components/Widget');
  const Widgets = widgetsMod?.default ?? widgetsMod;
  const WidgetBase = widgetMod?.default ?? widgetMod;

  // Present but not resolvable: a version whose internals moved. Decline
  // quietly and let Lobby's own column carry the list.
  if (!Widgets || !WidgetBase) return;

  class LobbyOnlineWidget extends WidgetBase {
    className() {
      return 'LobbyFofWidget';
    }

    icon() {
      return 'fas fa-signal';
    }

    title() {
      return app.translator.trans('ernestdefoe-lobby.forum.online.label');
    }

    content() {
      return onlineEnabled() ? <OnlineList host="fof" /> : null;
    }
  }

  new Widgets()
    .add({
      key: 'lobbyOnline',
      component: LobbyOnlineWidget,
      isDisabled: false,
      isUnique: true,
      placement: 'end',
      position: 1,
    })
    .extend(app, 'ernestdefoe-lobby');
}

/**
 * Bespoke, through `window.BespokeWidgetQueue`: the queue is drained on every
 * registry lookup, so it does not matter whose initializer runs first.
 *
 * Labels are translation KEYS, not translated text: Bespoke resolves them in
 * the reader's locale, and calls string methods on them that the array
 * `trans()` returns does not have.
 */
function registerBespoke() {
  const flarum = flarumGlobal();
  if (!flarum?.extensions || !('ernestdefoe-bespoke' in flarum.extensions)) return;

  const g = globalThis as any;
  g.BespokeWidgetQueue = g.BespokeWidgetQueue || [];
  g.BespokeWidgetQueue.push({
    type: 'lobby-online',
    label: 'ernestdefoe-lobby.forum.online.label',
    icon: 'fas fa-signal',
    zones: ['sidebar', 'above-list', 'below-list', 'footer'],
    schema: [],
    component: {
      view() {
        return onlineEnabled() ? (
          <div className="LobbyBespokeWidget">
            <OnlineList host="bespoke" />
          </div>
        ) : null;
      },
    },
  });
}
