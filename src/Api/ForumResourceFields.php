<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby\Api;

use ErnestDefoe\Lobby\ActiveTheme;
use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Extension\ExtensionManager;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Database\ConnectionInterface;

/**
 * What the sidebar needs before it draws: the member count under the forum's
 * name, whether this viewer may see the Online list, and the viewer's unread
 * mentions per channel.
 */
class ForumResourceFields
{
    /** The header's member count is furniture: ten minutes stale is fine. */
    private const MEMBER_TTL = 600;

    /** Mention notifications, as flarum/mentions names them. */
    private const MENTION_TYPES = ['postMentioned', 'userMentioned', 'groupMentioned'];

    public function __construct(
        protected ExtensionManager $extensions,
        protected ConnectionInterface $db,
        protected Cache $cache,
        protected ActiveTheme $theme,
    ) {
    }

    public function __invoke(): array
    {
        return [
            Schema\Integer::make('lobbyMemberCount')
                ->visible($this->onLobby(...))
                ->get(fn (): int => (int) $this->cache->remember(
                    'ernestdefoe-lobby.member_count',
                    self::MEMBER_TTL,
                    fn () => $this->db->table('users')->count()
                )),

            Schema\Boolean::make('lobbyCanViewOnline')
                ->visible($this->onLobby(...))
                ->get(fn ($forum, Context $context): bool => $context->getActor()->can('ernestdefoe-lobby.viewOnline')),

            /*
             * Unread mentions per channel, for the red badges in the sidebar:
             * `{tagId: count}`.
             *
             * 🚨 ONE grouped query for the whole sidebar, never one per tag,
             * and only for a signed-in viewer on a forum running both tags
             * and mentions. It walks the viewer's own unread notifications
             * (core indexes user_id, is_deleted, read_at, type for exactly
             * this) to the post, the discussion and its tags.
             *
             * Every identifier is handed to the query builder, which applies
             * the table prefix; the one raw fragment names no table.
             *
             * A tag the viewer can no longer see is simply never drawn: the
             * sidebar only shows tags the forum payload already gave them.
             */
            Schema\Arr::make('lobbyMentions')
                ->visible(fn ($forum, Context $context): bool => $this->onLobby($forum, $context)
                    && ! $context->getActor()->isGuest()
                    && $this->extensions->isEnabled('flarum-mentions')
                    && $this->extensions->isEnabled('flarum-tags'))
                ->get(fn ($forum, Context $context): array => $this->db->table('notifications')
                    ->join('posts', 'posts.id', '=', 'notifications.subject_id')
                    ->join('discussion_tag', 'discussion_tag.discussion_id', '=', 'posts.discussion_id')
                    ->where('notifications.user_id', $context->getActor()->id)
                    ->where('notifications.is_deleted', false)
                    ->whereNull('notifications.read_at')
                    ->whereIn('notifications.type', self::MENTION_TYPES)
                    ->groupBy('discussion_tag.tag_id')
                    ->select('discussion_tag.tag_id')
                    ->selectRaw('COUNT(*) as mentions')
                    ->pluck('mentions', 'tag_id')
                    ->map(fn ($count) => (int) $count)
                    ->all()),
        ];
    }

    /** Visitors on another Wardrobe theme pay for none of these. */
    public function onLobby(mixed $forum, Context $context): bool
    {
        return $this->theme->isLobby($context->request);
    }
}
