<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Post\Post;
use Flarum\Tags\Tag;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;

/**
 * 🚨 The N+1 gate, at a realistic size: 25 tags (five parents with three
 * children each, five loose, five secondary) and 60 discussions, each with a
 * first post and two tags.
 *
 * The number of queries must not grow with the number of rows or channels.
 *
 * Measured 2026-10-18 (SQLite, prefixed): the list is 12 queries (guest) /
 * 16 (member) for 1 row and for 50, and Lobby's share is one (the first-post
 * eager load); the forum payload gains 2 (child tags and their parents) for
 * a guest and 3 (plus mentions) for a member; the Online list is 1 warm.
 */
class QueryCountTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    private const DISCUSSIONS = 60;

    protected function seedForum(): void
    {
        $now = Carbon::now();
        $tags = [];
        $id = 1;

        for ($p = 0; $p < 5; $p++) {
            $parent = $id++;
            $tags[] = ['id' => $parent, 'name' => "Parent $p", 'slug' => "parent-$p", 'position' => $p, 'parent_id' => null, 'last_posted_at' => $now];
            for ($c = 0; $c < 3; $c++) {
                $tags[] = ['id' => $id, 'name' => "Child $p.$c", 'slug' => "child-$p-$c", 'position' => $c, 'parent_id' => $parent, 'last_posted_at' => $now];
                $id++;
            }
        }
        for ($l = 0; $l < 5; $l++) {
            $tags[] = ['id' => $id, 'name' => "Loose $l", 'slug' => "loose-$l", 'position' => 10 + $l, 'parent_id' => null, 'last_posted_at' => $now];
            $id++;
        }
        for ($s = 0; $s < 5; $s++) {
            $tags[] = ['id' => $id, 'name' => "Topic $s", 'slug' => "topic-$s", 'position' => null, 'parent_id' => null, 'discussion_count' => 10 - $s];
            $id++;
        }

        $users = [];
        for ($u = 2; $u <= 11; $u++) {
            $users[] = ['id' => $u, 'username' => "member$u", 'email' => "member$u@machine.local", 'is_email_confirmed' => 1, 'last_seen_at' => $now];
        }

        $discussions = $posts = $links = [];
        for ($d = 1; $d <= self::DISCUSSIONS; $d++) {
            $author = 2 + ($d % 10);
            $discussions[] = ['id' => $d, 'title' => "Discussion $d", 'created_at' => $now->copy()->subMinutes($d), 'last_posted_at' => $now->copy()->subMinutes($d), 'user_id' => $author, 'first_post_id' => $d, 'comment_count' => 1, 'last_posted_user_id' => $author];
            $posts[] = ['id' => $d, 'discussion_id' => $d, 'number' => 1, 'created_at' => $now->copy()->subMinutes($d), 'user_id' => $author, 'type' => 'comment', 'content' => "<t><p>Opening post number $d, with enough words to make an excerpt.</p></t>"];
            $parent = 1 + 4 * ($d % 5);
            $links[] = ['discussion_id' => $d, 'tag_id' => $parent];
            $links[] = ['discussion_id' => $d, 'tag_id' => $parent + 1 + ($d % 3)];
        }

        $this->prepareDatabase([
            User::class => $users,
            Tag::class => $tags,
            Discussion::class => $discussions,
            Post::class => $posts,
            'discussion_tag' => $links,
        ]);
    }

    /** @return array{0: int, 1: int} [queries, rows] */
    private function measure(string $path, array $query, ?int $actor): array
    {
        $request = $this->request('GET', $path, $actor ? ['authenticatedAs' => $actor] : [])->withQueryParams($query);

        $this->send($request); // warm caches (member count, online list, settings)

        $queries = 0;
        $this->database()->listen(function () use (&$queries) {
            $queries++;
        });

        $response = $this->send($request);
        $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        $body = json_decode((string) $response->getBody(), true);

        return [$queries, is_array($body['data'] ?? null) && array_is_list($body['data']) ? count($body['data']) : 0];
    }

    public static function actors(): array
    {
        return ['guest' => [null], 'member' => [2], 'admin' => [1]];
    }

    // The include the forum's discussion list asks for.
    private const LIST_INCLUDE = 'user,lastPostedUser,mostRelevantPost,mostRelevantPost.user,tags,tags.parent';

    #[Test]
    #[DataProvider('actors')]
    public function the_discussion_list_costs_the_same_for_one_row_or_fifty(?int $actor)
    {
        $this->extension('flarum-tags', 'flarum-mentions', 'flarum-sticky', 'ernestdefoe-lobby');
        $this->seedForum();

        [$one, $rows1] = $this->measure('/api/discussions', ['include' => self::LIST_INCLUDE, 'page' => ['limit' => 1]], $actor);
        [$fifty, $rows50] = $this->measure('/api/discussions', ['include' => self::LIST_INCLUDE, 'page' => ['limit' => 50]], $actor);


        $this->assertSame(1, $rows1);
        $this->assertSame(50, $rows50);
        $this->assertSame($one, $fifty);
    }

    #[Test]
    #[DataProvider('actors')]
    public function the_forum_payload_does_not_grow_with_the_channels(?int $actor)
    {
        $this->extension('flarum-tags', 'flarum-mentions', 'flarum-sticky', 'ernestdefoe-lobby');
        $this->seedForum();

        [$queries] = $this->measure('/api', [], $actor);

        // Keep one parent's three children, drop the other twelve.
        $this->database()->table('tags')->whereNotNull('parent_id')->where('parent_id', '>', 1)->delete();
        [$fewer] = $this->measure('/api', [], $actor);

        $this->assertSame($fewer, $queries);
    }

    #[Test]
    #[DataProvider('actors')]
    public function the_online_list_is_one_query_once_warm(?int $actor)
    {
        $this->extension('flarum-tags', 'flarum-mentions', 'flarum-sticky', 'ernestdefoe-lobby');
        $this->seedForum();

        [$guest] = $this->measure('/api/lobby/online', [], null);
        [$online] = $this->measure('/api/lobby/online', [], $actor);

        // A guest's request is the list alone: the shared "who" list is
        // cached, leaving one query for visibility. A signed-in request adds
        // only the session's own lookups (token, user, groups), which every
        // endpoint pays.
        $this->assertSame(1, $guest);
        $this->assertLessThanOrEqual(5, $online);
    }
}
