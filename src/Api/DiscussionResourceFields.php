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
use Flarum\Discussion\Discussion;
use Flarum\Extension\ExtensionManager;
use Flarum\Post\CommentPost;
use s9e\TextFormatter\Utils;

/**
 * The one-line excerpt under each discussion title.
 */
class DiscussionResourceFields
{
    public const EXCERPT_LENGTH = 160;

    public function __invoke(): array
    {
        return [
            /*
             * Plain text, never markup: an excerpt is a hint, and letting post
             * formatting into a list row means one bad paste restyles the page.
             *
             * 🚨 Read from the `firstPost` the index endpoint eager-loads for
             * the whole page in one query (extend.php). A discussion without
             * the relation loaded gets no excerpt rather than a lazy load.
             */
            Schema\Str::make('lobbyExcerpt')
                ->nullable()
                ->visible(fn (Discussion $discussion, Context $context): bool => $context->listing() && self::wanted($context))
                ->get(fn (Discussion $discussion): ?string => $this->excerpt($discussion)),
        ];
    }

    /**
     * Lobby's own excerpt is wanted when the visitor is on Lobby and
     * fof/synopsis is not enabled.
     *
     * 🚨 With fof/synopsis enabled, the forum already has an excerpt: the
     * owner's choice of first or last post and length, per tag, and each
     * member's "show excerpts" preference. Lobby draws synopsis's in its own
     * slot under the title (rows.tsx) and does no excerpt work of its own: no
     * eager load, no field. Two excerpts per row was the 1.0.0 bug.
     */
    public static function wanted(Context $context): bool
    {
        return ! resolve(ExtensionManager::class)->isEnabled('fof-synopsis')
            && resolve(ActiveTheme::class)->isLobby($context->request);
    }

    public function excerpt(Discussion $discussion): ?string
    {
        if (! $discussion->relationLoaded('firstPost')) {
            return null;
        }

        $post = $discussion->getRelation('firstPost');

        if (! $post instanceof CommentPost || ! is_string($post->parsed_content) || $post->parsed_content === '') {
            return null;
        }

        /*
         * 🚨 The eager load is not visibility-scoped, so this reads the post
         * whatever its state. A first post that is hidden, or still waiting
         * for flarum/approval, says nothing in the list: its text would
         * otherwise reach readers who cannot open it. Both are columns on
         * the loaded row, so the check costs no query.
         */
        if ($post->hidden_at !== null || $post->getAttribute('is_approved') === false || $post->getAttribute('is_approved') === 0) {
            return null;
        }

        $xml = $post->parsed_content;

        // Attachment markup carries filenames and sizes, which read as noise
        // in a sentence of prose. Quotes are somebody else's words.
        foreach (['UPL-IMAGE-PREVIEW', 'UPL-FILE', 'QUOTE', 'POSTMENTION'] as $tag) {
            $xml = Utils::removeTag($xml, $tag);
        }

        $text = trim(preg_replace('/\s+/u', ' ', Utils::removeFormatting($xml)) ?? '');

        if ($text === '') {
            return null;
        }

        if (mb_strlen($text) <= self::EXCERPT_LENGTH) {
            return $text;
        }

        $cut = mb_substr($text, 0, self::EXCERPT_LENGTH);
        $space = mb_strrpos($cut, ' ');

        // One long token (a URL, a CJK run) must not collapse it to nothing.
        if ($space !== false && $space > self::EXCERPT_LENGTH * 0.6) {
            $cut = mb_substr($cut, 0, $space);
        }

        return rtrim($cut).'…';
    }
}
