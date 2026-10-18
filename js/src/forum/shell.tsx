import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Link from 'flarum/common/components/Link';
import Icon from 'flarum/common/components/Icon';
import classList from 'flarum/common/utils/classList';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import IndexPage from 'flarum/forum/components/IndexPage';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';

import Sidebar from './components/Sidebar';
import { closeDrawer, isDrawerOpen, toggleDrawer } from './drawer';
import { currentTag } from './channels';
import formatCount from './formatCount';
import { MessageBar, ThreadInfoModal, channelOf, currentTopicPage } from './topic/topicPage';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.${key}`, params);

/**
 * The parts of Lobby that are on every page: the sidebar, and on phones the
 * top bar and the tab bar.
 *
 * 🚨 Mounted next to the router rather than inside a page, the same way core
 * mounts its own header. A page component only exists while its route does,
 * so a sidebar drawn by IndexPage would vanish on every discussion and
 * profile; mounted here it is one element for the whole session, and
 * `m.mount` puts it on the same redraw as everything else.
 */
export default function installShell() {
  extend(app, 'mount', () => {
    const root = document.getElementById('app');
    if (!root) return;

    const mount = (tag: string, className: string, component: any, before = false) => {
      const el = document.createElement(tag);
      el.className = className;
      before ? root.prepend(el) : root.append(el);
      m.mount(el, component);
    };

    mount('div', 'LobbyShell-sidebar', Sidebar, true);
    mount('div', 'LobbyShell-topbar', PhoneTopBar, true);
    mount('div', 'LobbyShell-tabbar', TabBar);
    mount('div', 'LobbyShell-dock', TopicDock);

    // The scrim behind the open drawer; a tap on it closes the drawer.
    const scrim = document.createElement('div');
    scrim.className = 'LobbyShell-scrim';
    scrim.addEventListener('click', closeDrawer);
    root.append(scrim);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
    });
  });
}

/** What the phone's top bar calls the page. */
function pageTitle(): string {
  if (app.current.matches(IndexPage)) {
    const tag = currentTag();
    return tag ? tag.name() : (t('sidebar.activity', {}) as any);
  }

  if (app.current.matches(DiscussionPage)) {
    const discussion = app.current.get('discussion');
    if (discussion) return discussion.title();
  }

  return (app as any).title || app.forum.attribute<string>('title');
}

/** The discussion on screen, once it has loaded. */
function topic(): any {
  return app.current.matches(DiscussionPage) ? app.current.get('discussion') || null : null;
}

/**
 * The docked message bar, on discussion pages. Mounted with the shell so it
 * can be fixed to the foot of the column on every screen size; it steps aside
 * while the composer is open, which then takes its place.
 */
const TopicDock = {
  view() {
    const discussion = topic();
    if (!discussion || app.composer.isVisible()) return null;

    return <MessageBar discussion={discussion} />;
  },
};

const PhoneTopBar = {
  view() {
    const onIndex = app.current.matches(IndexPage);
    const hash = onIndex && currentTag();
    const discussion = topic();

    if (discussion) {
      const channel = channelOf(discussion);
      const replies = discussion.replyCount() || 0;

      return (
        <header className="LobbyTopBar LobbyTopBar--topic">
          <button type="button" className="LobbyTopBar-button" aria-label={t('phone.back') as any} onclick={() => app.history.back()}>
            <Icon name="fas fa-chevron-left" />
          </button>
          <div className="LobbyTopBar-stack">
            <span className="LobbyTopBar-sub">
              {channel ? (
                <span>
                  <span className="LobbyTopBar-hash" aria-hidden="true">
                    #
                  </span>
                  {channel.name()} ·{' '}
                </span>
              ) : null}
              {t('topic.replies', { count: replies, formatted: formatCount(replies) })}
            </span>
            <h1 className="LobbyTopBar-title">
              <span className="LobbyTopBar-text">{discussion.title()}</span>
            </h1>
          </div>
          <button
            type="button"
            className="LobbyTopBar-button"
            aria-label={t('topic.thread_info_and_controls') as any}
            onclick={() => app.modal.show(ThreadInfoModal, { discussion, stream: app.current.get('stream') || currentTopicPage()?.stream })}
          >
            <Icon name="fas fa-ellipsis-h" />
          </button>
        </header>
      );
    }

    return (
      <header className="LobbyTopBar">
        {onIndex || !app.history.canGoBack() ? (
          <button
            type="button"
            className="LobbyTopBar-button"
            aria-label={t('phone.open_channels') as any}
            aria-expanded={isDrawerOpen() ? 'true' : 'false'}
            onclick={toggleDrawer}
          >
            <Icon name="fas fa-bars" />
          </button>
        ) : (
          <button type="button" className="LobbyTopBar-button" aria-label={t('phone.back') as any} onclick={() => app.history.back()}>
            <Icon name="fas fa-chevron-left" />
          </button>
        )}
        <h1 className="LobbyTopBar-title">
          {hash ? (
            <span className="LobbyTopBar-hash" aria-hidden="true">
              #
            </span>
          ) : null}
          <span className="LobbyTopBar-text">{pageTitle()}</span>
        </h1>
        <div className="LobbyTopBar-search">
          <GlobalSearch state={app.search.state} />
        </div>
      </header>
    );
  },
};

const TabBar = {
  view() {
    const user = app.session.user;
    const route = m.route.get() || '/';
    const messages = !!user && 'flarum-messages' in (flarum as any).extensions;
    const unreadDialogs = (user && user.attribute<number>('unreadDialogCount')) || 0;
    const alerts = (user && user.newNotificationCount()) || 0;
    const home = app.current.matches(IndexPage);

    // Unkeyed on purpose: the set of tabs changes (no Messages for a guest),
    // and Mithril refuses a mix of keyed tabs and empty slots.
    const tab = (_name: string, icon: string, label: any, attrs: Record<string, any>, active: boolean, badge = 0) => (
      <Link
        {...attrs}
        className={classList('LobbyTab', { active })}
        aria-current={active ? 'page' : undefined}
        onclick={(e: MouseEvent) => {
          closeDrawer();
          attrs.onclick?.(e);
        }}
      >
        <span className="LobbyTab-icon">
          <Icon name={icon} />
          {badge ? <span className="LobbyTab-badge">{formatCount(badge)}</span> : null}
        </span>
        <span className="LobbyTab-label">{label}</span>
      </Link>
    );

    return (
      <nav className="LobbyTabBar" aria-label={t('phone.tabs') as any}>
        {tab('home', 'fas fa-house', t('phone.home'), { href: app.route('index') }, home)}
        {messages
          ? tab('messages', 'far fa-comment', t('sidebar.messages'), { href: app.route('messages') }, route.startsWith('/messages'), unreadDialogs)
          : null}
        {user
          ? tab('alerts', 'far fa-bell', t('phone.alerts'), { href: app.route('notifications') }, route.startsWith('/notifications'), alerts)
          : null}
        {user
          ? tab('you', 'far fa-user', t('phone.you'), { href: app.route.user(user) }, route.startsWith('/u/' + user.slug()))
          : tab(
              'you',
              'far fa-user',
              t('phone.log_in'),
              {
                href: '#',
                onclick: (e: MouseEvent) => {
                  e.preventDefault();
                  app.modal.show(() => import('flarum/forum/components/LogInModal'));
                },
              },
              false
            )}
      </nav>
    );
  },
};
