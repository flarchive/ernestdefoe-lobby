import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import Component from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import Button from 'flarum/common/components/Button';
import Dropdown from 'flarum/common/components/Dropdown';
import Icon from 'flarum/common/components/Icon';
import Avatar from 'flarum/common/components/Avatar';
import Modal from 'flarum/common/components/Modal';
import username from 'flarum/common/helpers/username';
import classList from 'flarum/common/utils/classList';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';

import { attach, detach, onlineData } from '../onlineStore';
import { onlineEnabled } from '../components/OnlineList';
import formatCount from '../formatCount';
import { captureReadPosition, dayLabel, forgetReadPosition } from './streamDecor';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.topic.${key}`, params);

/** The discussion's channel: its first primary tag, else its first tag. */
export function channelOf(discussion: any): any {
  const tags: any[] = (discussion?.tags?.() || []).filter(Boolean);
  return tags.find((tag) => tag.position() !== null && !tag.isChild()) || tags[0] || null;
}

/**
 * Who has taken part, from what is already loaded: the starter, the last
 * poster and every author on the posts the stream holds. No request.
 */
export function participants(discussion: any, stream: any, limit = 12): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  const add = (user: any) => {
    if (!user || seen.has(user.id())) return;
    seen.add(user.id());
    out.push(user);
  };

  add(discussion.user());
  for (const post of stream?.posts?.() || []) if (post && post.contentType() === 'comment') add(post.user());
  add(discussion.lastPostedUser());

  return out.slice(0, limit);
}

function hasUnread(discussion: any): boolean {
  return !!app.session.user && discussion.isUnread();
}

function jumpToUnread(discussion: any, stream: any) {
  stream?.goToNumber(Math.min(discussion.lastPostNumber() || 1, (discussion.lastReadPostNumber() || 0) + 1));
}

/** fof/best-answer's chosen post, when that extension says there is one. */
function bestAnswer(discussion: any): any {
  if (!discussion.attribute('hasBestAnswer')) return null;
  const rel = discussion.data?.relationships?.bestAnswerPost?.data;
  return rel ? app.store.getById('posts', rel.id) : null;
}

/** The discussion page on screen, for controls opened outside it (the phone sheet). */
let currentPage: any = null;

export function currentTopicPage(): any {
  return currentPage;
}

/** While true, the sidebar extension leaves core's items alone so the header can borrow them. */
let borrowing = false;

function borrowSidebarItems(page: any) {
  borrowing = true;
  try {
    return page.sidebarItems();
  } finally {
    borrowing = false;
  }
}

/**
 * The discussion page as a channel conversation: a header bar instead of the
 * hero, a Thread info panel instead of the scrubber.
 *
 * 🚨 Core's DiscussionPage and PostStream are extended, never replaced:
 * loading, scroll anchoring, read tracking and realtime all stay core's.
 */
export default function installTopicPage() {
  override(DiscussionPage.prototype, 'hero', function (this: any) {
    return this.discussion ? <TopicHeader page={this} /> : null;
  });

  extend(DiscussionPage.prototype, 'oninit', function (this: any) {
    this.lobbyCaptured = null;
  });

  extend(DiscussionPage.prototype, 'view', function (this: any) {
    currentPage = this;

    // Captured at the first render that has the discussion, and only then.
    if (this.discussion && this.lobbyCaptured !== this.discussion) {
      forgetReadPosition(this.discussion);
      captureReadPosition(this.discussion);
      this.lobbyCaptured = this.discussion;
    }
  });

  extend(DiscussionPage.prototype, 'onremove', function (this: any) {
    forgetReadPosition(this.discussion);
    if (currentPage === this) currentPage = null;
  });

  extend(DiscussionPage.prototype, 'sidebarItems', function (this: any, items) {
    if (borrowing || !this.discussion) return;

    // Moved to the header bar.
    items.remove('controls');
    items.remove('subscription');
    // Replaced by the Thread info panel's jump buttons.
    items.remove('scrubber');

    items.add('lobbyThreadInfo', <ThreadInfo discussion={this.discussion} stream={this.stream} />, 200);
  });
}

interface PageAttrs {
  page: any;
}

class TopicHeader extends Component<PageAttrs> {
  view() {
    const page = this.attrs.page;
    const discussion = page.discussion;
    const stream = page.stream;
    const channel = channelOf(discussion);
    const people = participants(discussion, stream, 4);
    const solution = bestAnswer(discussion);
    const borrowed = borrowSidebarItems(page);
    const follow = borrowed.has('subscription') ? borrowed.get('subscription') : null;
    const controls = DiscussionControls.controls(discussion, page).toArray();
    const replies = discussion.replyCount() || 0;

    return (
      <header className="LobbyTopicHeader">
        <div className="LobbyTopicHeader-title">
          {channel ? (
            <Link href={app.route('tag', { tags: channel.slug() })} className="LobbyTopicHeader-channel">
              <span aria-hidden="true">#</span>
              {channel.name()}
            </Link>
          ) : null}
          {channel ? (
            <span className="LobbyTopicHeader-sep" aria-hidden="true">
              ›
            </span>
          ) : null}
          <h1 className="LobbyTopicHeader-name">{discussion.title()}</h1>
          <span className="LobbyTopicHeader-replies">{t('replies', { count: replies, formatted: formatCount(replies) })}</span>
          {people.length ? (
            <span className="LobbyStack" role="img" aria-label={t('participants_label', { count: people.length }) as any}>
              {people.map((user) => (
                <Avatar user={user} className="LobbyStack-face" title="" />
              ))}
            </span>
          ) : null}
        </div>
        <div className="LobbyTopicHeader-actions">
          {solution ? (
            <Button className="Button LobbySolved" icon="fas fa-check" onclick={() => stream.goToNumber(solution.number())}>
              {t('solved')}
            </Button>
          ) : null}
          {hasUnread(discussion) ? (
            <Button className="Button Button--primary" onclick={() => jumpToUnread(discussion, stream)}>
              {t('jump_unread')}
            </Button>
          ) : null}
          {follow}
          {controls.length ? (
            <Dropdown
              className="LobbyTopicHeader-controls"
              buttonClassName="Button Button--icon"
              menuClassName="Dropdown-menu--right"
              icon="fas fa-ellipsis-h"
              accessibleToggleLabel={app.translator.trans('core.forum.discussion_controls.toggle_dropdown_accessible_label')}
            >
              {controls}
            </Dropdown>
          ) : null}
        </div>
      </header>
    );
  }
}

interface InfoAttrs {
  discussion: any;
  stream: any;
  /** In the phone's sheet the controls come along too. */
  withControls?: boolean;
}

/**
 * Thread info: who started it and when, replies, tags, jump buttons, and the
 * people taking part with presence dots (the same Online data as the index,
 * one shared request).
 */
export class ThreadInfo extends Component<InfoAttrs> {
  oncreate(vnode: any) {
    super.oncreate(vnode);
    if (onlineEnabled()) attach();
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    if (onlineEnabled()) detach();
  }

  view() {
    const { discussion, stream } = this.attrs;
    const tags: any[] = (discussion.tags?.() || []).filter(Boolean);
    const people = participants(discussion, stream);
    const online = onlineData();
    const presence = new Map<string, any>();

    for (const member of [...(online?.staff || []), ...(online?.members || [])]) presence.set(String(member.id), member);

    const go = (fn: () => void) => () => {
      fn();
      app.modal.close();
    };

    return (
      <div className="LobbyThreadInfo">
        <section className="LobbyThreadInfo-section">
          <h3 className="LobbyThreadInfo-label">{t('thread_info')}</h3>
          <dl className="LobbyThreadInfo-facts">
            <dt>{t('started_by')}</dt>
            <dd>{discussion.user() ? <Link href={app.route.user(discussion.user())}>{username(discussion.user())}</Link> : username(null)}</dd>
            <dt>{t('created')}</dt>
            <dd>
              {dayLabel(discussion.createdAt())}, {dayjs(discussion.createdAt()).format('LT')}
            </dd>
            <dt>{t('replies_label')}</dt>
            <dd>{formatCount(discussion.replyCount() || 0)}</dd>
          </dl>
          {tags.length ? (
            <div className="LobbyThreadInfo-tags">
              {tags.map((tag) => (
                <Link href={app.route('tag', { tags: tag.slug() })} className="LobbyTagChip" onclick={() => app.modal.close()}>
                  {tag.position() !== null ? '#' : ''}
                  {tag.name()}
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <section className="LobbyThreadInfo-section">
          <h3 className="LobbyThreadInfo-label">{t('jump_to')}</h3>
          <div className="LobbyJump">
            <Button className="Button" onclick={go(() => stream.goToFirst())}>
              {t('first')}
            </Button>
            <Button
              className={classList('Button', { 'LobbyJump--unread': hasUnread(discussion) })}
              disabled={!hasUnread(discussion)}
              onclick={go(() => jumpToUnread(discussion, stream))}
            >
              {t('unread')}
            </Button>
            <Button className="Button" onclick={go(() => stream.goToLast())}>
              {t('latest')}
            </Button>
          </div>
        </section>

        {people.length ? (
          <section className="LobbyThreadInfo-section">
            <h3 className="LobbyThreadInfo-label">{t('participants', { count: formatCount(people.length) })}</h3>
            <ul className="LobbyOnline-list">
              {people.map((user) => {
                const here = presence.get(String(user.id()));
                return (
                  <li key={user.id()}>
                    <Link href={app.route.user(user)} className="LobbyMember" onclick={() => app.modal.close()}>
                      <span className="LobbyFace LobbyFace--avatar">
                        <Avatar user={user} />
                        {here ? <span className={classList('LobbyDot', here.hidden ? 'LobbyDot--away' : 'LobbyDot--on')} /> : null}
                      </span>
                      <span className="LobbyMember-text">
                        <span className="LobbyMember-name">{username(user)}</span>
                        {here ? <span className="LobbyMember-status">{t('online')}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {this.attrs.withControls ? (
          <section className="LobbyThreadInfo-section LobbyThreadInfo-controls">
            <ul>
              {DiscussionControls.controls(discussion, currentPage)
                .toArray()
                .map((control: any) => (
                  <li onclick={() => app.modal.close()}>{control}</li>
                ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }
}

/** The phone's ⋯: Thread info and the discussion controls, in a sheet. */
export class ThreadInfoModal extends Modal<any> {
  className() {
    return 'LobbyThreadModal Modal--small';
  }

  title() {
    return t('thread_info');
  }

  content() {
    return (
      <div className="Modal-body">
        <ThreadInfo discussion={this.attrs.discussion} stream={this.attrs.stream} withControls />
      </div>
    );
  }
}

/**
 * The docked "Message #channel › title…" bar. It opens core's composer; it is
 * never an editor of its own. When the reader cannot reply, it says why in
 * place rather than disappearing.
 */
export class MessageBar extends Component<{ discussion: any }> {
  view() {
    const discussion = this.attrs.discussion;
    const user = app.session.user;
    const channel = channelOf(discussion);
    const locked = !!discussion.attribute?.('isLocked');

    if (user && !discussion.canReply()) {
      return (
        <div className="LobbyMessageBar LobbyMessageBar--disabled" role="status">
          <Icon name={locked ? 'fas fa-lock' : 'fas fa-ban'} />
          <span>{locked ? t('locked') : app.translator.trans('core.forum.discussion_controls.cannot_reply_text')}</span>
        </div>
      );
    }

    const label = !user
      ? app.translator.trans('core.forum.discussion_controls.log_in_to_reply_button')
      : channel
        ? t('message_in', { channel: channel.name(), title: discussion.title() })
        : t('message', { title: discussion.title() });

    return (
      <div className="LobbyMessageBar">
        <button
          type="button"
          className="LobbyMessageBar-button"
          onclick={() => DiscussionControls.replyAction.call(discussion, true, false).catch(() => {})}
        >
          <Icon name="fas fa-plus-circle" className="LobbyMessageBar-icon" />
          <span className="LobbyMessageBar-label">{label}</span>
          <span className="LobbyMessageBar-send" aria-hidden="true">
            <Icon name="fas fa-arrow-right" />
          </span>
        </button>
      </div>
    );
  }
}
