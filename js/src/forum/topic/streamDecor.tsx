import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.forum.topic.${key}`, params);

/** Consecutive messages by one author within this window share one header. */
const GROUP_WINDOW = 7 * 60 * 1000;

/**
 * Where "New messages" goes: the viewer's read position when they OPENED the
 * discussion, kept for as long as they stay on it.
 *
 * Read live, `lastReadPostNumber` moves forward as soon as the reader scrolls
 * onto the first new post, and the line would walk down the page in front of
 * them. Captured once, it stays put until they leave, like a chat app's.
 */
const readAtOpen = new Map<string, { read: number; last: number }>();

export function captureReadPosition(discussion: any) {
  if (!discussion || readAtOpen.has(discussion.id())) return;
  readAtOpen.set(discussion.id(), {
    read: app.session.user ? discussion.lastReadPostNumber() || 0 : 0,
    // Messages that arrive while the reader is watching are not "new since
    // you were last here"; only those already posted when they opened it.
    last: discussion.lastPostNumber() || 0,
  });
}

export function forgetReadPosition(discussion: any) {
  if (discussion) readAtOpen.delete(discussion.id());
}

/** A Page Builder article's comments, or a blog post: post #1 is the article. */
export function isArticle(discussion: any): boolean {
  return !!(discussion?.attribute?.('pagebuilderRecordUrl') || discussion?.attribute?.('blogMeta'));
}

function dayKey(date: Date): string {
  return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
}

export function dayLabel(date: Date): any {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);

  if (dayKey(date) === dayKey(today)) return t('today');
  if (dayKey(date) === dayKey(yesterday)) return t('yesterday');

  return dayjs(date).format('LL');
}

/**
 * "↳ replying to @name: excerpt", when a message OPENS with a post mention or
 * a quote of one.
 *
 * 🚨 Read from what the post already carries: flarum/mentions renders a
 * mention as `<a class="PostMention" data-id="…">Name</a>` in contentHtml, and
 * the mentioned post is usually already in the store (it is on the page, or
 * came along as an included relation). Nothing is requested. Memoised per
 * post and per content, so a redraw does not re-parse every message.
 */
const replyCache = new WeakMap<object, { html: string; value: ReplyContext | null }>();

interface ReplyContext {
  id: string;
  name: string;
  excerpt: string;
  href: string | null;
}

const OPENS_WITH_MENTION = /^\s*(?:<blockquote[^>]*>\s*)?(?:<p>\s*)?<a\s[^>]*class="PostMention"[^>]*>/i;

function replyContext(post: any): ReplyContext | null {
  const html = post.contentHtml?.();
  if (typeof html !== 'string' || !html) return null;

  const cached = replyCache.get(post);
  if (cached && cached.html === html) return cached.value;

  let value: ReplyContext | null = null;

  if (OPENS_WITH_MENTION.test(html)) {
    // DOMParser, not a detached element: a parsed document never loads images
    // or runs handlers.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchor = doc.querySelector('a.PostMention');
    const id = anchor?.getAttribute('data-id');

    if (anchor && id) {
      const target = app.store.getById<any>('posts', id);
      let excerpt = '';

      if (target?.contentHtml?.()) {
        const body = new DOMParser().parseFromString(target.contentHtml(), 'text/html').body;
        // Its own mentions and quotes are not what it SAID.
        body.querySelectorAll('a.PostMention, a.UserMention, blockquote').forEach((el) => el.remove());
        const text = body.textContent || '';
        excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 90);
      }

      // Only a site-relative or http(s) link is used as a link; anything else
      // (it would take hand-written HTML to get one here) falls back to '#'.
      const raw = anchor.getAttribute('href') || '';
      const href = /^(\/(?!\/)|https?:\/\/)/i.test(raw.trim()) ? raw.trim() : null;

      value = { id, name: (anchor.textContent || '').replace(/^@/, '').trim(), excerpt, href };
    }
  }

  replyCache.set(post, { html, value });

  return value;
}

/**
 * The post stream as a conversation: day dividers, the "New messages" line,
 * same-author grouping and reply context.
 *
 * 🚨 Done in PostStream's VIEW, every render, as a pure function of each post
 * and the one before it. A post that arrives without a page load —
 * flarum/realtime, the reader's own reply, "load more" — goes through exactly
 * the same code as one that was there at first paint. A one-time DOM pass
 * after mount would miss all of them.
 *
 * 🚨 Nothing is inserted BETWEEN the stream's keyed items. Dividers and the
 * reply line go INSIDE the post's own item, where core already puts its
 * "time gap" notice, so the stream's keys, indices and scroll anchoring are
 * exactly core's.
 */
export default function installStreamDecor() {
  // 🚨 By PATH, not by import: core code-splits PostStream, so at boot the
  // module is not loaded yet and an imported reference is undefined. The
  // string form applies the extension when core loads the chunk.
  extend('flarum/forum/components/PostStream' as any, 'view' as any, function (this: any, vdom: any) {
    const items: any[] = vdom?.children;
    if (!Array.isArray(items)) return;

    const discussion = this.discussion;
    const posts: any[] = this.stream.posts();
    const start: number = this.stream.visibleStart;
    const opened = readAtOpen.get(discussion.id());
    const readLine = opened?.read || 0;
    const lastAtOpen = opened?.last || 0;
    const article = isArticle(discussion);
    let newShown = false;

    // Core wraps the first post's item in a fragment when it has items after
    // it; find the real item either way.
    const itemFor = (vnode: any) => (vnode && vnode.tag === '[' ? vnode.children?.find((c: any) => c?.attrs?.['data-index'] !== undefined) : vnode);

    for (const vnode of items) {
      const item = itemFor(vnode);
      const index = item?.attrs?.['data-index'];
      if (index === undefined || !item.attrs['data-id']) continue;

      const i = index - start;
      const post = posts[i];
      if (!post) continue;

      const prev = i > 0 ? posts[i - 1] : null;
      const time: Date = post.createdAt();
      const isComment = post.contentType() === 'comment';
      // Four fixed slots, null when empty: the post's own vnode keeps the same
      // position in its item whether or not a divider is drawn, so a live post
      // arriving (and regrouping its neighbour) never remounts a message.
      let daySlot: any = null;
      let newSlot: any = null;
      let timeSlot: any = null;
      let replySlot: any = null;
      const classes: string[] = [];

      // Core's own "N days later" notice is replaced by the day divider.
      if (Array.isArray(item.children)) {
        item.children = item.children.filter((c: any) => !(c?.attrs?.className === 'PostStream-timeGap'));
      }

      const newDay = !prev || dayKey(prev.createdAt()) !== dayKey(time);

      if (newDay) {
        daySlot = (
          <div className="LobbyDivider LobbyDivider--day" role="separator">
            <span>{dayLabel(time)}</span>
          </div>
        );
      }

      const isNew = !newShown && readLine > 0 && post.number() > readLine && post.number() <= lastAtOpen && isComment;

      if (isNew) {
        newShown = true;
        newSlot = (
          <div className="LobbyDivider LobbyDivider--new" role="separator">
            <span>{t('new_messages')}</span>
          </div>
        );
      }

      if (article && post.number() === 1) {
        classes.push('LobbyPost--article');
      } else if (isComment) {
        classes.push('LobbyPost');

        const grouped =
          !newDay &&
          !isNew &&
          prev &&
          prev.contentType() === 'comment' &&
          !prev.isHidden() &&
          !post.isHidden() &&
          !(article && prev.number() === 1) &&
          prev.user() &&
          prev.user() === post.user() &&
          time.getTime() - prev.createdAt().getTime() <= GROUP_WINDOW;

        if (grouped) {
          classes.push('LobbyPost--cont');
          timeSlot = (
            <time className="LobbyPost-gutterTime" dateTime={time.toISOString()} title={dayjs(time).format('LLLL')}>
              {dayjs(time).format('LT')}
            </time>
          );
        }

        const reply = !post.isHidden() && replyContext(post);

        if (reply) {
          classes.push('LobbyPost--reply');
          replySlot = (
            <a
              className="LobbyReplyTo"
              href={reply.href || '#'}
              onclick={(e: MouseEvent) => {
                // Same-discussion mentions scroll the stream like core's own
                // mention links; anything else is a normal link.
                const target = app.store.getById<any>('posts', reply.id);
                if (target && target.discussion() === discussion) {
                  e.preventDefault();
                  this.stream.goToNumber(target.number());
                }
              }}
            >
              <span aria-hidden="true">↳ </span>
              {t('replying_to', { name: '@' + reply.name })}
              {reply.excerpt ? <span className="LobbyReplyTo-excerpt">: {reply.excerpt}</span> : null}
            </a>
          );
        }
      } else {
        classes.push('LobbyPost--event');
      }

      if (classes.length) item.attrs.className = (item.attrs.className || '') + ' ' + classes.join(' ');

      // Focusable, so a tap on a touch screen (and Tab on a keyboard) brings
      // up the message's toolbar the way hovering does with a mouse.
      if (isComment && !(article && post.number() === 1)) item.attrs.tabindex = '0';

      if (Array.isArray(item.children)) {
        item.children = [daySlot, newSlot, timeSlot, replySlot, ...item.children];
      }
    }
  });
}
