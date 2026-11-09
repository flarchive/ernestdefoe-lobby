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

class OnlineTest extends LobbyTestCase
{
    /** @return list<string> */
    private function names(array $body, string $section): array
    {
        return array_column($body[$section], 'displayName');
    }

    #[Test]
    public function a_guest_sees_members_who_disclose_their_status_and_nobody_else()
    {
        [$status, $body] = $this->get('/api/lobby/online');

        $this->assertSame(200, $status);
        $this->assertSame(['normal'], $this->names($body, 'members'));
        $this->assertNotContains('shy', $this->names($body, 'members'));
        $this->assertNotContains('away', $this->names($body, 'members'));
    }

    #[Test]
    public function staff_are_listed_first_under_their_own_heading()
    {
        $this->database()->table('users')->where('id', 1)->update(['last_seen_at' => \Carbon\Carbon::now(), 'preferences' => json_encode(['discloseOnline' => true])]);

        [, $body] = $this->get('/api/lobby/online');

        $this->assertSame(['admin'], $this->names($body, 'staff'));
        $this->assertNotContains('admin', $this->names($body, 'members'));
    }

    #[Test]
    public function staff_who_may_see_last_seen_times_also_see_hidden_members_marked_hidden()
    {
        [, $body] = $this->get('/api/lobby/online', 1);

        $shy = array_values(array_filter($body['members'], fn ($m) => $m['displayName'] === 'shy'));

        $this->assertCount(1, $shy);
        $this->assertTrue($shy[0]['hidden']);
    }

    #[Test]
    public function a_member_hiding_their_status_still_sees_themselves()
    {
        [, $body] = $this->get('/api/lobby/online', 3);

        $this->assertContains('shy', $this->names($body, 'members'));
    }

    #[Test]
    public function the_list_is_refused_without_the_permission()
    {
        $this->database()->table('group_permission')->where('permission', 'ernestdefoe-lobby.viewOnline')->delete();

        [$status] = $this->get('/api/lobby/online');

        $this->assertSame(403, $status);
    }
}
