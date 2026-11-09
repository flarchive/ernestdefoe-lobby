<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby\Tests\integration;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Group\Group;
use Flarum\Post\Post;
use Flarum\Tags\Tag;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;

/**
 * Users: 1 admin (staff), 2 member, 3 member hiding their online status,
 * 4 member last seen yesterday.
 * Tags: 1 "General" (primary, no children), 2 "Games" (primary, parent of 3),
 * 3 "Minecraft" (child of 2).
 * Discussion 1 by 2 in Games + Minecraft: post 1 (first), post 2 by 3
 * mentioning 2.
 */
abstract class LobbyTestCase extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('flarum-tags', 'flarum-mentions', 'ernestdefoe-lobby');

        $now = Carbon::now();

        $this->prepareDatabase([
            User::class => [
                ['id' => 2, 'username' => 'normal', 'email' => 'normal@machine.local', 'is_email_confirmed' => 1, 'last_seen_at' => $now, 'preferences' => json_encode(['discloseOnline' => true])],
                ['id' => 3, 'username' => 'shy', 'email' => 'shy@machine.local', 'is_email_confirmed' => 1, 'last_seen_at' => $now, 'preferences' => json_encode(['discloseOnline' => false])],
                ['id' => 4, 'username' => 'away', 'email' => 'away@machine.local', 'is_email_confirmed' => 1, 'last_seen_at' => $now->copy()->subDay(), 'preferences' => json_encode(['discloseOnline' => true])],
            ],
            'group_user' => [
                ['user_id' => 2, 'group_id' => Group::MEMBER_ID],
            ],
            Tag::class => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'position' => 0, 'parent_id' => null],
                ['id' => 2, 'name' => 'Games', 'slug' => 'games', 'position' => 1, 'parent_id' => null],
                ['id' => 3, 'name' => 'Minecraft', 'slug' => 'minecraft', 'position' => 0, 'parent_id' => 2],
            ],
            Discussion::class => [
                ['id' => 1, 'title' => 'Season reset', 'created_at' => $now, 'last_posted_at' => $now, 'user_id' => 2, 'first_post_id' => 1, 'comment_count' => 2],
            ],
            'discussion_tag' => [
                ['discussion_id' => 1, 'tag_id' => 2],
                ['discussion_id' => 1, 'tag_id' => 3],
            ],
            Post::class => [
                ['id' => 1, 'discussion_id' => 1, 'number' => 1, 'created_at' => $now, 'user_id' => 2, 'type' => 'comment', 'content' => '<r><p>Ender chests <STRONG><s>**</s>carry over<e>**</e></STRONG>. <QUOTE><p>quoted words</p></QUOTE></p></r>'],
                ['id' => 2, 'discussion_id' => 1, 'number' => 2, 'created_at' => $now, 'user_id' => 3, 'type' => 'comment', 'content' => '<t><p>@normal see this</p></t>'],
            ],
            'notifications' => [
                ['id' => 1, 'user_id' => 2, 'from_user_id' => 3, 'type' => 'postMentioned', 'subject_id' => 2, 'created_at' => $now, 'is_deleted' => 0, 'read_at' => null],
                // Read: not counted.
                ['id' => 2, 'user_id' => 2, 'from_user_id' => 3, 'type' => 'userMentioned', 'subject_id' => 2, 'created_at' => $now, 'is_deleted' => 0, 'read_at' => $now],
            ],
        ]);
    }

    /** @return array{0: int, 1: mixed} */
    protected function get(string $path, ?int $actor = null, array $query = []): array
    {
        $options = $actor ? ['authenticatedAs' => $actor] : [];
        $response = $this->send($this->request('GET', $path, $options)->withQueryParams($query));

        return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
    }
}
