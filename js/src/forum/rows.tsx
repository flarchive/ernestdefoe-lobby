import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Link from 'flarum/common/components/Link';
import Icon from 'flarum/common/components/Icon';
import listItems from 'flarum/common/helpers/listItems';
import highlight from 'flarum/common/helpers/highlight';
import username from 'flarum/common/helpers/username';
import humanTime from 'flarum/common/helpers/humanTime';
import abbreviateNumber from 'flarum/common/utils/abbreviateNumber';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import DiscussionList from 'flarum/forum/components/DiscussionList';

import { since } from './visits';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.${key}`, params);

/**
 * Discussion rows as chat messages: avatar, who and when, a Pinned chip,
 * the title, a one-line excerpt, and on the right the reply count and the
 * last activity.
 *
 * Built by replacing core's `main` and `stats` items rather than the whole
 * view, so the avatar, the badges, the controls dropdown, swipe-to-read and
 * anything other extensions add to the row all still work.
 */
export default function installRows() {
  extend(DiscussionListItem.prototype, 'contentItems', function (this: any, items) {
    const discussion = this.attrs.discussion;
    const user = discussion.user();
    const excerpt = discussion.attribute('lobbyExcerpt');
    const pinned = discussion.attribute('isSticky');

    // Core's info line, minus the "replied 3h ago" part, which the right
    // column says. Tags, and whatever else extensions put there, stay.
    const info = this.infoItems();
    info.remove('terminalPost');

    // fof/synopsis puts its excerpt in the info line, which Lobby draws ABOVE
    // the title. When it is there, it is the excerpt: it moves to Lobby's slot
    // under the title (the server then sends no excerpt of Lobby's own), so a
    // row never shows the text twice. Its phone variant says whether the
    // member wants excerpts on phones at all.
    const synopsis = info.has('excerpt') ? info.get('excerpt') : null;
    const synopsisOnPhone = info.has('excerptM');
    info.remove('excerpt');
    info.remove('excerptM');

    items.remove('main');
    items.add(
      'main',
      <Link href={app.route.discussion(discussion, this.getJumpTo())} className="DiscussionListItem-main LobbyRow-main">
        <span className="LobbyRow-meta">
          <span className="LobbyRow-author">{username(user)}</span>
          <span className="LobbyRow-time">{humanTime(discussion.createdAt())}</span>
          {pinned ? <span className="LobbyRow-pinned">{t('row.pinned')}</span> : null}
          <ul className="DiscussionListItem-info LobbyRow-info">{listItems(info.toArray())}</ul>
        </span>
        <h2 className="DiscussionListItem-title LobbyRow-title">{highlight(discussion.title(), this.highlightRegExp)}</h2>
        {excerpt ? (
          <span className="LobbyRow-excerpt">{excerpt}</span>
        ) : synopsis ? (
          <span className={'LobbyRow-excerpt LobbyRow-excerpt--synopsis' + (synopsisOnPhone ? '' : ' LobbyRow-excerpt--wide')}>{synopsis}</span>
        ) : null}
      </Link>,
      80
    );

    items.remove('stats');
    items.add(
      'stats',
      <span className="LobbyRow-stats">
        <span className="LobbyRow-replies" aria-label={t('row.replies', { count: discussion.replyCount() }) as any}>
          <Icon name="far fa-comment" />
          {abbreviateNumber(discussion.replyCount())}
        </span>
        {discussion.lastPostedAt() ? <span className="LobbyRow-last">{t('row.last', { ago: humanTime(discussion.lastPostedAt()) })}</span> : null}
      </span>,
      70
    );
  });

  /*
   * "New since your last visit": a divider above the first row that has
   * moved since the reader was last here.
   *
   * 🚨 Derived from what the list already holds — each row's lastPostedAt
   * against a time kept in the browser (visits.ts). No request, no query,
   * nothing per row.
   *
   * Only on the newest-first ordering, where "new" is one block at the top;
   * under Top or Oldest it would land somewhere arbitrary and mean nothing.
   * Pinned rows sit above it whatever their age, as in the mockup. And only
   * when the list also holds older rows: a divider with nothing old below it
   * divides nothing.
   */
  extend(DiscussionList.prototype, 'view', function (this: any, vdom: any) {
    const ul = vdom?.children?.find?.((child: any) => child?.attrs?.className === 'DiscussionList-discussions');
    if (!ul || !Array.isArray(ul.children)) return;

    // Core nests one fragment of rows per loaded page. Flattened ALWAYS, not
    // only when a divider is drawn, so the tree keeps one shape and Mithril
    // never remounts every row because the divider came or went.
    const rows: any[] = ul.children.flatMap((child: any) => (child && child.tag === '[' ? child.children : [child]));
    ul.children = rows;

    const line = since();
    if (!line) return;

    const params = this.attrs.state.getParams();
    const sort = params.sort || (app.search.state as any).defaultSort?.() || 'latest';
    if (sort !== 'latest' || params.q) return;

    const lastPosted = (row: any) => {
      const discussion = row?.children?.[0]?.attrs?.discussion;
      if (!discussion || discussion.attribute('isSticky')) return null;
      return discussion.lastPostedAt()?.getTime() || 0;
    };

    const first = rows.findIndex((row) => (lastPosted(row) ?? 0) > line);
    const anyOld = rows.some((row) => {
      const at = lastPosted(row);
      return at !== null && at <= line;
    });

    if (first === -1 || !anyOld) return;

    rows.splice(
      first,
      0,
      <li key="lobby-new-divider" className="LobbyNewDivider" role="separator" aria-label={t('row.new_since') as any}>
        <span>{t('row.new_since')}</span>
      </li>
    );
  });
}
