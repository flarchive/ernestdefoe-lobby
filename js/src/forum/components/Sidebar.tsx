import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import Icon from 'flarum/common/components/Icon';
import Avatar from 'flarum/common/components/Avatar';
import listItems from 'flarum/common/helpers/listItems';
import username from 'flarum/common/helpers/username';
import classList from 'flarum/common/utils/classList';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import HeaderPrimary from 'flarum/forum/components/HeaderPrimary';
import HeaderSecondary from 'flarum/forum/components/HeaderSecondary';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import IndexPage from 'flarum/forum/components/IndexPage';
import type Mithril from 'mithril';

import { channelGroups, currentTag, mentionCount } from '../channels';
import { channelUnread, markChannelSeen, seenThisSession } from '../visits';
import { closeDrawer } from '../drawer';
import formatCount from '../formatCount';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.${key}`, params);

/**
 * Core's sidebar navigation, minus what the channel list already covers.
 *
 * 🚨 Built from `IndexSidebar.navItems()` rather than drawn from scratch, so
 * everything other extensions add there — Following, private discussions,
 * a page link — still appears. Dropped: "All discussions" (our Activity),
 * flarum/tags' own tag links (the channels below), flarum/messages' link
 * (drawn above with its unread badge) and Following (a filter in the
 * channel header).
 */
const TAG_ITEM = /^(allDiscussions|tags|separator|moreTags|tag\d+|messages|following)$/;

/**
 * Every other extension link goes in an Explore group under the channels, so
 * a forum with twenty extensions does not push its channels off the screen.
 */
function extraNavItems(): Mithril.Children[] {
  let items;

  try {
    items = IndexSidebar.prototype.navItems.call(Object.create(IndexSidebar.prototype));
  } catch (e) {
    return [];
  }

  for (const key of Object.keys(items.toObject())) {
    if (TAG_ITEM.test(key)) items.remove(key);
  }

  return items.toArray();
}

/**
 * The left sidebar: forum, search, navigation, channels, and the reader.
 *
 * Mounted once, outside the router (see shell.tsx), so it survives every
 * page change and is the same element on every page.
 */
export default class Sidebar extends Component {
  view() {
    const forum = app.forum;
    const logo = forum.attribute<string | null>('logoUrl');
    const title = forum.attribute<string>('title');
    const members = forum.attribute<number>('lobbyMemberCount');
    const onIndex = app.current.matches(IndexPage);
    const tag = onIndex ? currentTag() : null;
    const user = app.session.user;
    const messages = user && 'flarum-messages' in (flarum as any).extensions;
    const unreadDialogs = (user && user.attribute<number>('unreadDialogCount')) || 0;
    const nav = extraNavItems();

    return (
      <nav className="LobbySidebar" aria-label={t('sidebar.label')}>
        <div className="LobbySidebar-head">
          <Link href={app.route('index')} className="LobbySidebar-forum" onclick={closeDrawer}>
            <span className={classList('LobbySidebar-mark', { 'LobbySidebar-mark--logo': !!logo })} aria-hidden="true">
              {logo ? <img src={logo} alt="" /> : (title || '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="LobbySidebar-forumText">
              <span className="LobbySidebar-title">{title}</span>
              {typeof members === 'number' ? (
                <span className="LobbySidebar-members">{t('sidebar.members', { count: members, formatted: formatCount(members) })}</span>
              ) : null}
            </span>
          </Link>
        </div>

        <div className="LobbySidebar-search">
          <GlobalSearch state={app.search.state} />
        </div>

        <div className="LobbySidebar-scroll">
          <ul className="LobbySidebar-nav">
            <li>
              <Link
                href={app.route('index')}
                className={classList('LobbyNav', {
                  active: onIndex && !tag && !app.search.state.params().q && !m.route.get().startsWith('/following'),
                })}
                onclick={closeDrawer}
              >
                <Icon name="fas fa-wave-square" className="LobbyNav-icon" />
                <span className="LobbyNav-label">{t('sidebar.activity')}</span>
              </Link>
            </li>
            {messages ? (
              <li>
                <Link href={app.route('messages')} className="LobbyNav" onclick={closeDrawer}>
                  <Icon name="far fa-comment" className="LobbyNav-icon" />
                  <span className="LobbyNav-label">{t('sidebar.messages')}</span>
                  {unreadDialogs ? (
                    <span className="LobbyCount LobbyCount--accent" aria-label={t('sidebar.unread_messages', { count: unreadDialogs }) as any}>
                      {formatCount(unreadDialogs)}
                    </span>
                  ) : null}
                </Link>
              </li>
            ) : null}
          </ul>

          {channelGroups().map((group) => (
            <section className="LobbyGroup" key={group.key} aria-label={group.label || undefined}>
              {group.label ? <h3 className="LobbyGroup-label">{group.label}</h3> : null}
              <ul className="LobbyGroup-channels">
                {group.tags.map((channel) => this.channel(channel, tag))}
                {group.more ? (
                  <li>
                    <Link href={app.route('tags')} className="LobbyChannel LobbyChannel--more" onclick={closeDrawer}>
                      <span className="LobbyChannel-name">{t('sidebar.more_tags')}</span>
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>
          ))}

          {nav.length ? (
            <section className="LobbyGroup LobbyGroup--explore" aria-label={t('sidebar.explore') as any}>
              <h3 className="LobbyGroup-label">{t('sidebar.explore')}</h3>
              <ul className="LobbySidebar-nav" onclick={closeDrawer}>
                {listItems(nav)}
              </ul>
            </section>
          ) : null}

          <div className="LobbySidebar-primary" onclick={closeDrawer}>
            <HeaderPrimary />
          </div>
        </div>

        <div className="LobbySidebar-user">
          {user ? (
            <Link href={app.route.user(user)} className="LobbyMe" onclick={closeDrawer}>
              <span className="LobbyMe-avatar">
                <Avatar user={user} />
                <span className={classList('LobbyDot', user.preferences()?.discloseOnline === false ? 'LobbyDot--away' : 'LobbyDot--on')} />
              </span>
              <span className="LobbyMe-text">
                <span className="LobbyMe-name">{username(user)}</span>
                <span className="LobbyMe-status">
                  {user.preferences()?.discloseOnline === false ? t('presence.invisible') : t('presence.online')}
                </span>
              </span>
            </Link>
          ) : null}
          <div className="LobbySidebar-controls">
            <HeaderSecondary />
          </div>
        </div>
      </nav>
    );
  }

  channel(channel: any, active: any) {
    const isActive = active === channel;
    const mentions = isActive || seenThisSession(channel.id()) ? 0 : mentionCount(channel);
    const unread = !isActive && !mentions && channelUnread(channel);

    return (
      <li key={channel.id()}>
        <Link
          href={app.route('tag', { tags: channel.slug() })}
          className={classList('LobbyChannel', {
            active: isActive,
            'LobbyChannel--unread': unread || mentions > 0,
            'LobbyChannel--child': channel.isChild(),
          })}
          aria-current={isActive ? 'page' : undefined}
          onclick={() => {
            markChannelSeen(channel.id());
            closeDrawer();
          }}
        >
          <span className="LobbyChannel-hash" aria-hidden="true">
            #
          </span>
          <span className="LobbyChannel-name">{channel.name()}</span>
          {mentions ? (
            <span className="LobbyCount LobbyCount--mention" aria-label={t('sidebar.mentions', { count: mentions }) as any}>
              {formatCount(mentions)}
            </span>
          ) : unread ? (
            <span className="LobbyUnreadDot" role="img" aria-label={t('sidebar.unread') as any} />
          ) : null}
        </Link>
      </li>
    );
  }
}
