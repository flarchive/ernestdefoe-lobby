import app from 'flarum/forum/app';

/**
 * Tags as channels, grouped the way the forum already orders them.
 *
 * - A primary tag with children is a GROUP: its name is the heading, and the
 *   tag itself is the first channel under it, followed by its children in
 *   their flarum/tags order. That is how an owner who nests "Games >
 *   Minecraft, Valheim" already thinks of it.
 * - Primary tags with no children share one "Channels" group, first, in
 *   their flarum/tags order.
 * - Secondary tags are a "Tags" group: the few flarum/tags preloads, most
 *   active first, with a link to the full list when there are more — the
 *   same few core's own sidebar shows.
 *
 * Nothing is fetched: the forum payload carries the top-level tags (from
 * flarum/tags) and the child tags (from Lobby, in the same request).
 */

export interface ChannelGroup {
  key: string;
  label: string | null;
  tags: any[];
  more?: boolean;
}

export function tagsEnabled(): boolean {
  return 'flarum-tags' in (flarum as any).extensions;
}

const byPosition = (a: any, b: any) => (a.position() ?? 0) - (b.position() ?? 0);

export function channelGroups(): ChannelGroup[] {
  if (!tagsEnabled()) return [];

  const tags = app.store.all<any>('tags');
  const primaries = tags.filter((t) => t.position() !== null && !t.isChild()).sort(byPosition);
  const children: Record<string, any[]> = {};

  for (const tag of tags) {
    if (tag.position() === null || !tag.isChild()) continue;
    const parent = tag.parent();
    if (!parent) continue;
    (children[parent.id()] ||= []).push(tag);
  }

  const loose = primaries.filter((t) => !children[t.id()]);
  const groups: ChannelGroup[] = [];

  if (loose.length) {
    groups.push({ key: 'channels', label: app.translator.trans('ernestdefoe-lobby.forum.sidebar.channels', {}, true) as string, tags: loose });
  }

  for (const parent of primaries) {
    const kids = children[parent.id()];
    if (!kids) continue;
    groups.push({ key: 'tag' + parent.id(), label: parent.name(), tags: [parent, ...kids.sort(byPosition)] });
  }

  const secondary = tags.filter((t) => t.position() === null && !t.isChild()).sort((a, b) => b.discussionCount() - a.discussionCount());

  if (secondary.length) {
    groups.push({
      key: 'secondary',
      label: app.translator.trans('ernestdefoe-lobby.forum.sidebar.tags', {}, true) as string,
      tags: secondary.slice(0, 3),
      more: secondary.length > 3,
    });
  }

  return groups;
}

/** Every channel in sidebar order, for the phone's chip row. */
export function allChannels(): any[] {
  const seen = new Set<string>();

  return channelGroups()
    .flatMap((g) => g.tags)
    .filter((t) => (seen.has(t.id()) ? false : (seen.add(t.id()), true)));
}

export function currentTag(): any {
  return tagsEnabled() && typeof (app as any).currentTag === 'function' ? (app as any).currentTag() : null;
}

export function mentionCount(tag: any): number {
  const map = app.forum.attribute<Record<string, number> | undefined>('lobbyMentions');

  return (map && map[tag.id()]) || 0;
}
