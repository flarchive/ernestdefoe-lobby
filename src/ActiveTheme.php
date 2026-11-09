<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby;

use Flarum\Extension\ExtensionManager;
use Flarum\Http\RequestUtil;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Is Lobby the theme this visitor is looking at?
 *
 * On a forum running ernestdefoe/wardrobe, several themes are installed and
 * each visitor sees one. Wardrobe keeps every other theme's CSS and JS out
 * of a visitor's bundle, but PHP runs for everyone. Lobby's server-side
 * work (forum-payload counts, the channel query, the excerpt eager load,
 * the font preload) should only be paid for by visitors on Lobby.
 *
 * Without Wardrobe, or with Lobby not among Wardrobe's themes, Lobby is in
 * everyone's bundle, so the answer is always yes.
 *
 * 🚨 The forum page's boot payload comes from an internal API sub-request,
 * which does not carry the visitor's cookies, so a guest's Wardrobe cookie
 * is invisible there. The page decides once, in middleware, from the real
 * request; sub-requests made while building that page reuse the decision.
 */
class ActiveTheme
{
    private const ID = 'ernestdefoe-lobby';

    private const REGISTRY = 'Ernestdefoe\\Wardrobe\\ThemeRegistry';

    /** Decided for the forum page being rendered in this process, if any. */
    private ?bool $page = null;

    public function __construct(protected ExtensionManager $extensions)
    {
    }

    public function decideForPage(ServerRequestInterface $request): void
    {
        $this->page = $this->decide($request);
    }

    public function isLobby(?ServerRequestInterface $request): bool
    {
        if ($this->page !== null) {
            return $this->page;
        }

        return $request === null || $this->decide($request);
    }

    protected function decide(ServerRequestInterface $request): bool
    {
        if (! $this->extensions->isEnabled('ernestdefoe-wardrobe') || ! class_exists(self::REGISTRY)) {
            return true;
        }

        $registry = resolve(self::REGISTRY);

        if (! in_array(self::ID, $registry->ids(), true)) {
            return true;
        }

        $cookie = $request->getCookieParams()['wardrobe_theme'] ?? null;

        return $registry->resolve(RequestUtil::getActor($request), is_string($cookie) ? $cookie : null) === self::ID;
    }
}
