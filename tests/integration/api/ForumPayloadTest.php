<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby\Tests\integration\api;

use ErnestDefoe\Lobby\Tests\integration\LobbyTestCase;
use PHPUnit\Framework\Attributes\Test;

class ForumPayloadTest extends LobbyTestCase
{
    #[Test]
    public function the_forum_carries_the_member_count_and_the_child_tags()
    {
        [$status, $body] = $this->get('/api');

        $this->assertSame(200, $status);
        $this->assertSame(4, $body['data']['attributes']['lobbyMemberCount']);
        $this->assertTrue($body['data']['attributes']['lobbyCanViewOnline']);

        $children = array_column($body['data']['relationships']['lobbyChildTags']['data'], 'id');
        $this->assertSame(['3'], $children);

        $included = array_column(array_filter($body['included'], fn ($r) => $r['type'] === 'tags'), 'id');
        $this->assertContains('3', $included);
    }

    #[Test]
    public function a_member_gets_their_unread_mentions_per_channel()
    {
        [, $body] = $this->get('/api', 2);

        // One unread mention, in a discussion tagged Games and Minecraft. The
        // read one is not counted.
        $this->assertEquals(['2' => 1, '3' => 1], $body['data']['attributes']['lobbyMentions']);
    }

    #[Test]
    public function a_guest_gets_no_mention_counts()
    {
        [, $body] = $this->get('/api');

        $this->assertArrayNotHasKey('lobbyMentions', $body['data']['attributes']);
    }

    #[Test]
    public function discussion_rows_carry_a_plain_text_excerpt()
    {
        [$status, $body] = $this->get('/api/discussions');

        $this->assertSame(200, $status);
        $this->assertSame('Ender chests carry over.', $body['data'][0]['attributes']['lobbyExcerpt']);
    }

    #[Test]
    public function a_hidden_first_post_gives_no_excerpt()
    {
        $this->database()->table('posts')->where('id', 1)->update(['hidden_at' => \Carbon\Carbon::now()]);

        [$status, $body] = $this->get('/api/discussions', 1);

        $this->assertSame(200, $status);
        $this->assertNull($body['data'][0]['attributes']['lobbyExcerpt']);
    }

    #[Test]
    public function the_forum_page_stamps_the_accent_and_renders()
    {
        $response = $this->send($this->request('GET', '/'));

        $this->assertSame(200, $response->getStatusCode());
        $this->assertStringContainsString('data-lobby-accent="amber"', (string) $response->getBody());
    }
}
