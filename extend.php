<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

use ErnestDefoe\Lobby\ActiveTheme;
use ErnestDefoe\Lobby\Api;
use ErnestDefoe\Lobby\Http\DecideTheme;
use ErnestDefoe\Lobby\LobbyServiceProvider;
use Flarum\Api\Context;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource;
use Flarum\Api\Schema;
use Flarum\Extend;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\Tags\Tag;
use Illuminate\Contracts\Filesystem\Factory as Filesystems;
use Psr\Http\Message\ServerRequestInterface;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less')
        ->content(function (Document $document, ServerRequestInterface $request) {
            // A visitor on another Wardrobe theme gets none of this.
            if (! resolve(ActiveTheme::class)->isLobby($request)) {
                return;
            }

            $accent = resolve(SettingsRepositoryInterface::class)->get('ernestdefoe-lobby.accent', 'amber');
            $accent = in_array($accent, ['amber', 'blue', 'green', 'pink', 'primary'], true) ? $accent : 'amber';

            /*
             * Stamped on <html> by the server, so the first paint is already
             * in the right colour rather than repainted after the bundle boots.
             *
             * 🚨 A CLOSURE, not the string. Core calls `is_callable()` on each
             * extra attribute, and a bare string that names a PHP function is
             * callable: an admin value that happened to be one would 500
             * every page. Only five values reach here, but the trap should
             * not be left set for the sixth.
             */
            $document->extraAttributes['data-lobby-accent'] = fn () => $accent;

            /*
             * The latin face of Geist is on every page, so it starts loading
             * with the stylesheet instead of after it. Mono and latin-ext are
             * left to the browser: they are small and often not needed.
             */
            $font = resolve(Filesystems::class)->disk('flarum-assets')
                ->url('extensions/ernestdefoe-lobby/fonts/geist-latin-wght-normal.woff2');

            $document->head[] = '<link rel="preload" href="'.e($font).'" as="font" type="font/woff2" crossorigin>';
        }),

    (new Extend\ServiceProvider())
        ->register(LobbyServiceProvider::class),

    (new Extend\Middleware('forum'))
        ->add(DecideTheme::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Routes('api'))
        ->get('/lobby/online', 'ernestdefoe-lobby.online', Api\Controller\OnlineController::class),

    /*
     * 🚨 Every setting has a READER, named beside it. A setting with no
     * reader is a control that lies.
     */
    (new Extend\Settings())
        // read by the document stamp above and by [data-lobby-accent] in less/
        ->default('ernestdefoe-lobby.accent', 'amber')
        // read by the Online column, the widgets and the phone layout
        ->default('ernestdefoe-lobby.show_online', true)
        ->serializeToForum('lobbyShowOnline', 'ernestdefoe-lobby.show_online', 'boolval')
        // read by OnlineMembers
        ->default('ernestdefoe-lobby.online_limit', 30)
        ->default('ernestdefoe-lobby.staff_groups', '1,4'),

    (new Extend\ApiResource(Resource\ForumResource::class))
        ->fields(Api\ForumResourceFields::class),

    (new Extend\ApiResource(Resource\DiscussionResource::class))
        ->fields(Api\DiscussionResourceFields::class)
        /*
         * The excerpt reads each row's first post. One eager load for the
         * whole page, never a query per row.
         *
         * 🚨 The WHOLE post, never a column subset: the eager load is shared,
         * and another extension that includes `firstPost` would serialise the
         * half-loaded model (a null createdAt blanks core's PostStream).
         */
        ->endpoint('index', fn (Endpoint\Index $endpoint) => $endpoint->eagerLoad(
            fn (array $included, Context $context) => Api\DiscussionResourceFields::wanted($context) ? ['firstPost'] : []
        )),

    /*
     * Channels are tags. flarum/tags only preloads the top-level ones, so
     * the sidebar's channel groups would be missing every child tag.
     *
     * One query for all of them (plus their parents, eager-loaded so the
     * `parent` linkage costs nothing per tag), through the tags' own
     * visibility rules, only on a forum running flarum/tags.
     */
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-tags', fn () => [
            (new Extend\ApiResource(Resource\ForumResource::class))
                ->fields(fn () => [
                    Schema\Relationship\ToMany::make('lobbyChildTags')
                        ->type('tags')
                        ->includable()
                        ->visible(fn ($forum, Context $context) => resolve(ActiveTheme::class)->isLobby($context->request))
                        ->get(fn ($forum, Context $context) => Tag::whereVisibleTo($context->getActor())
                            ->whereNotNull('parent_id')
                            ->whereNotNull('position')
                            ->with('parent')
                            ->orderBy('position')
                            ->get()
                            ->all()),
                ])
                ->endpoint(Endpoint\Show::class, fn (Endpoint\Show $endpoint) => $endpoint->addDefaultInclude(['lobbyChildTags'])),
        ]),
];
