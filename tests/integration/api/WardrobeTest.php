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

/**
 * Under ernestdefoe/wardrobe, a visitor on another theme pays for none of
 * Lobby's server-side work, and a visitor on Lobby gets all of it.
 *
 * Wardrobe accepts any enabled extension id as a theme, so flarum-mentions
 * stands in for "another theme" here.
 */
class WardrobeTest extends LobbyTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('flarum-tags', 'flarum-mentions', 'ernestdefoe-wardrobe', 'ernestdefoe-lobby');
        $this->setting('wardrobe.themes', json_encode(['flarum-mentions', 'ernestdefoe-lobby']));
        $this->setting('wardrobe.default', 'flarum-mentions');
    }

    private function page(?string $cookie): string
    {
        $request = $this->request('GET', '/');

        if ($cookie) {
            $request = $request->withCookieParams(['wardrobe_theme' => $cookie]);
        }

        return (string) $this->send($request)->getBody();
    }

    #[Test]
    public function a_guest_on_another_theme_gets_none_of_lobby()
    {
        $html = $this->page(null);

        $this->assertStringNotContainsString('data-lobby-accent', $html);
        $this->assertStringNotContainsString('lobbyMemberCount', $html);
        $this->assertStringNotContainsString('lobbyChildTags', $html);
        $this->assertStringNotContainsString('geist-latin-wght-normal.woff2', $html);
    }

    #[Test]
    public function a_guest_who_chose_lobby_gets_all_of_it_including_the_boot_payload()
    {
        $html = $this->page('ernestdefoe-lobby');

        $this->assertStringContainsString('data-lobby-accent="amber"', $html);
        $this->assertStringContainsString('lobbyMemberCount', $html);
        $this->assertStringContainsString('lobbyChildTags', $html);
    }

    #[Test]
    public function an_api_request_follows_the_visitors_cookie()
    {
        $other = json_decode((string) $this->send($this->request('GET', '/api/discussions'))->getBody(), true);
        $lobby = json_decode((string) $this->send($this->request('GET', '/api/discussions')->withCookieParams(['wardrobe_theme' => 'ernestdefoe-lobby']))->getBody(), true);

        $this->assertNull($other['data'][0]['attributes']['lobbyExcerpt'] ?? null);
        $this->assertSame('Ender chests carry over.', $lobby['data'][0]['attributes']['lobbyExcerpt']);
    }

    #[Test]
    public function a_member_who_prefers_lobby_gets_it()
    {
        $this->database()->table('users')->where('id', 2)->update(['preferences' => json_encode(['discloseOnline' => true, 'wardrobeTheme' => 'ernestdefoe-lobby'])]);

        $body = json_decode((string) $this->send($this->request('GET', '/api', ['authenticatedAs' => 2]))->getBody(), true);

        $this->assertArrayHasKey('lobbyMemberCount', $body['data']['attributes']);
        $this->assertArrayHasKey('lobbyMentions', $body['data']['attributes']);
    }
}
