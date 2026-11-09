<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby;

use Flarum\Foundation\AbstractServiceProvider;

class LobbyServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
        // One decision per request: the page's middleware and the API
        // sub-requests that build its payload must share it.
        $this->container->singleton(ActiveTheme::class);
    }
}
