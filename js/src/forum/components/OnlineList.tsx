import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import classList from 'flarum/common/utils/classList';
import stringToColor from 'flarum/common/utils/stringToColor';
import type Mithril from 'mithril';

import { attach, claim, detach, onlineData, release, type OnlineMember } from '../onlineStore';
import formatCount from '../formatCount';

export { placedElsewhere } from '../onlineStore';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.${key}`, params);

/** The owner has the list on, and this viewer may see it. */
export function onlineEnabled(): boolean {
  return app.forum.attribute('lobbyShowOnline') !== false && !!app.forum.attribute('lobbyCanViewOnline');
}

/**
 * What a member is doing, when ernestdefoe/presence says.
 *
 * Plain text in Presence's own words (its translation keys), so the two
 * extensions never describe the same thing differently. Presence has already
 * removed anything this viewer may not see.
 */
function activityText(activity: Record<string, any> | null): Mithril.Children {
  if (!activity) return null;

  const p = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-presence.forum.activity.${key}`, params);
  const title = activity.discussion?.title;

  switch (activity.kind) {
    case 'discussion':
      return title ? p('viewing', { thing: title }) : p('forum');
    case 'replying':
      return title ? p('replying', { thing: title }) : p('forum');
    case 'editing':
      return title ? p('editing', { thing: title }) : p('forum');
    case 'tag':
      return activity.tag ? p('browsing', { thing: '#' + activity.tag.name }) : p('forum');
    case 'page':
      return activity.title ? p('viewing', { thing: activity.title }) : p('forum');
    case 'user':
      return activity.user ? p('profile', { name: activity.user.displayName }) : p('forum');
    case 'starting':
    case 'tags':
    case 'index':
    case 'search':
    case 'messages':
    case 'settings':
    case 'notifications':
    case 'online':
      return p(activity.kind);
    default:
      return p('forum');
  }
}

function face(member: OnlineMember) {
  return (
    <span className="LobbyFace" style={member.avatarUrl ? undefined : { '--face-bg': member.color || '#' + stringToColor(member.displayName) }}>
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{member.displayName.charAt(0).toUpperCase()}</span>
      )}
      <span className={classList('LobbyDot', member.hidden ? 'LobbyDot--away' : 'LobbyDot--on')} />
    </span>
  );
}

interface OnlineListAttrs {
  /** Which host placed it: 'lobby', 'bespoke' or 'fof'. */
  host: string;
}

/**
 * The Online list: staff first, then everyone else, a presence dot on each.
 *
 * One component, every placement. The data is the shared store's; this only
 * reads it and claims its host, so the fallback column knows when another
 * host is showing the list.
 */
export default class OnlineList extends Component<OnlineListAttrs> {
  host!: string;

  oninit(vnode: Mithril.Vnode<OnlineListAttrs, this>) {
    super.oninit(vnode);
    // Read ONCE: releasing a host read at teardown could release a mount that
    // was never claimed and silence the fallback for good.
    this.host = this.attrs.host;
  }

  oncreate(vnode: Mithril.VnodeDOM<OnlineListAttrs, this>) {
    super.oncreate(vnode);
    attach();
    claim(this.host);
  }

  onremove(vnode: Mithril.VnodeDOM<OnlineListAttrs, this>) {
    super.onremove(vnode);
    release(this.host);
    detach();
  }

  view() {
    if (!onlineEnabled()) return <div className="LobbyOnline" hidden />;

    const data = onlineData();

    if (!data) {
      return (
        <div className="LobbyOnline LobbyOnline--loading" aria-busy="true">
          <div className="LobbyOnline-skeleton" />
          <div className="LobbyOnline-skeleton" />
          <div className="LobbyOnline-skeleton" />
        </div>
      );
    }

    if (!data.staff.length && !data.members.length) {
      return (
        <div className="LobbyOnline">
          <p className="LobbyOnline-empty">{t('online.empty')}</p>
        </div>
      );
    }

    const others = data.total - data.staff.length - data.members.length;

    return (
      <div className="LobbyOnline">
        {this.section('staff', t('online.staff', { count: formatCount(data.staff.length) }), data.staff)}
        {this.section('members', t('online.members', { count: formatCount(data.members.length) }), data.members)}
        {others > 0 ? <p className="LobbyOnline-more">{t('online.more', { count: others, formatted: formatCount(others) })}</p> : null}
      </div>
    );
  }

  section(key: string, label: Mithril.Children, members: OnlineMember[]) {
    if (!members.length) return null;

    return (
      <section className={'LobbyOnline-section LobbyOnline-section--' + key}>
        <h3 className="LobbyOnline-label">{label}</h3>
        <ul className="LobbyOnline-list">
          {members.map((member) => {
            const status = member.hidden ? t('presence.invisible') : activityText(member.activity);

            return (
              <li key={member.id}>
                <Link href={app.route('user', { username: member.slug })} className="LobbyMember">
                  {face(member)}
                  <span className="LobbyMember-text">
                    <span className="LobbyMember-name">{member.displayName}</span>
                    {status ? <span className="LobbyMember-status">{status}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
}
