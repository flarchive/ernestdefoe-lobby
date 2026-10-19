import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import Button from 'flarum/common/components/Button';
import Link from 'flarum/common/components/Link';
import Icon from 'flarum/common/components/Icon';
import listItems from 'flarum/common/helpers/listItems';
import classList from 'flarum/common/utils/classList';
import IndexPage from 'flarum/forum/components/IndexPage';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import WelcomeHero from 'flarum/forum/components/WelcomeHero';
import PageStructure from 'flarum/forum/components/PageStructure';
import Component from 'flarum/common/Component';

import { allChannels, currentTag } from './channels';
import { channelUnread, markChannelSeen } from './visits';
import OnlineList, { onlineEnabled, placedElsewhere } from './components/OnlineList';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.${key}`, params);

/** fof/forum-widgets-core's side section, as it names its own item. */
const FOF_SIDE_ITEM = 'endWidgetSection';

/**
 * Open the composer the way core's sidebar button does — through
 * IndexSidebar's own action, so flarum/tags (and anything else extending it)
 * still pre-fills the current channel's tag.
 */
export function startDiscussion() {
  IndexSidebar.prototype.newDiscussionAction.call(Object.create(IndexSidebar.prototype)).catch(() => {});
}

function canStart(): boolean {
  return !app.session.user || !!app.forum.attribute('canStartDiscussion');
}

/**
 * The index page as a channel: a header naming it, the list, a "start a
 * discussion" bar at the foot, and the Online column on the right.
 */
export default function installIndexPage() {
  // The channel header replaces the hero; the forum's welcome message moves
  // under it (below), so an owner who wrote one does not lose it.
  override(IndexPage.prototype, 'hero', () => null);

  // The sidebar is the shell's now, on every page.
  override(IndexPage.prototype, 'sidebar', () => null);

  extend(IndexPage.prototype, 'contentItems', function (items) {
    const tag = currentTag();

    if (tag) markChannelSeen(tag.id());

    items.remove('toolbar');
    items.add('lobbyHeader', <ChannelHeader page={this} channel={tag} />, 100);

    if (!tag && !app.search.state.params().q) {
      items.add(
        'lobbyWelcome',
        <div className="LobbyWelcome">
          <WelcomeHero />
        </div>,
        95
      );
    }

    items.add('lobbyCompose', <ComposeBar channel={tag} />, -100);
  });

  extend(PageStructure.prototype, 'containerItems', function (items) {
    if (!app.current.matches(IndexPage)) return;

    /*
     * fof/forum-widgets-core puts its side section in this list too. Left
     * alone that is a fourth column; adopted into the rail, the operator's
     * side widgets stack under the Online list in one right-hand column.
     */
    let side = null;

    if (items.has(FOF_SIDE_ITEM)) {
      side = items.get(FOF_SIDE_ITEM);
      items.remove(FOF_SIDE_ITEM);
    }

    const online = onlineEnabled() && !placedElsewhere();

    if (!online && !side) return;

    items.add(
      'lobbyRail',
      <aside className="LobbyRail" aria-label={t('online.label') as any}>
        {online ? <OnlineList host="lobby" /> : null}
        {side}
      </aside>,
      5
    );
  });
}

// 🚨 `channel`, never `tag`: Flarum's Component refuses an attribute named
// `tag` (Mithril 2 reserves it) and throws on init.
interface HeaderAttrs {
  page: any;
  channel: any;
}

class ChannelHeader extends Component<HeaderAttrs> {
  view() {
    const { page, channel: tag } = this.attrs;
    const following = m.route.get().startsWith('/following');
    const description = tag ? tag.description() : following ? null : app.forum.attribute<string>('description');

    // Core's toolbar, kept rather than rebuilt, so sort options and anything
    // other extensions add there still work. Search lives in the sidebar and
    // the top bar, so its copy here goes.
    const view = page.viewItems();
    const actions = page.actionItems();
    actions.remove('search');
    actions.remove('refresh');

    if (app.session.user && 'flarum-subscriptions' in (flarum as any).extensions && !tag) {
      view.add(
        'lobbyFollowing',
        <Link href={app.route(following ? 'index' : 'following')} className={classList('Button LobbyFilter', { active: following })}>
          {t('channel.following')}
        </Link>,
        -10
      );
    }

    return (
      <div className="LobbyChannelHeader">
        <div className="LobbyChannelHeader-main">
          <h1 className="LobbyChannelHeader-title">
            <span className="LobbyChannelHeader-hash" aria-hidden="true">
              #
            </span>
            {tag ? tag.name() : following ? t('channel.following') : t('sidebar.activity')}
          </h1>
          {description ? <p className="LobbyChannelHeader-description">{description}</p> : null}
        </div>
        <div className="LobbyChannelHeader-tools">
          <ul className="LobbyChannelHeader-view">{listItems(view.toArray())}</ul>
          <ul className="LobbyChannelHeader-actions">{listItems(actions.toArray())}</ul>
          <Button className="Button Button--primary LobbyChannelHeader-new" icon="fas fa-plus" onclick={startDiscussion} disabled={!canStart()}>
            {app.translator.trans(`core.forum.index.${canStart() ? 'start_discussion_button' : 'cannot_start_discussion_button'}`)}
          </Button>
        </div>
        <ChannelChips active={tag} />
      </div>
    );
  }
}

/** The phone's channel row: Activity, then every channel, scrolling sideways. */
class ChannelChips extends Component<{ active: any }> {
  view() {
    const channels = allChannels();
    if (!channels.length) return null;

    const active = this.attrs.active;

    return (
      <nav className="LobbyChips" aria-label={t('sidebar.label') as any}>
        <Link href={app.route('index')} className={classList('LobbyChip', { active: !active })}>
          {t('sidebar.activity')}
        </Link>
        {channels.map((channel) => (
          <Link
            key={channel.id()}
            href={app.route('tag', { tags: channel.slug() })}
            className={classList('LobbyChip', { active: channel === active })}
            onclick={() => markChannelSeen(channel.id())}
          >
            <span aria-hidden="true">#</span>
            {channel.name()}
            {channel !== active && channelUnread(channel) ? (
              <span className="LobbyUnreadDot" role="img" aria-label={t('sidebar.unread') as any} />
            ) : null}
          </Link>
        ))}
      </nav>
    );
  }
}

/**
 * "Start a discussion in #channel", sitting at the foot of the list like a
 * chat box. It opens the real composer; nothing is typed here.
 */
class ComposeBar extends Component<{ channel: any }> {
  view() {
    if (!canStart()) return null;

    const tag = this.attrs.channel;
    const label = tag ? t('compose.in_channel', { channel: tag.name() }) : t('compose.anywhere');

    return [
      <div className="LobbyCompose">
        <button type="button" className="LobbyCompose-button" onclick={startDiscussion}>
          <Icon name="fas fa-plus-circle" className="LobbyCompose-icon" />
          <span className="LobbyCompose-label">{label}</span>
        </button>
      </div>,
      // The phone's floating button, the same action.
      <button
        type="button"
        className="LobbyFab"
        aria-label={app.translator.trans('core.forum.index.start_discussion_button') as any}
        onclick={startDiscussion}
      >
        <Icon name="fas fa-plus" />
      </button>,
    ];
  }
}
