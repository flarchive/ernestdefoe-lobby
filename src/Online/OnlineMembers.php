<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby\Online;

use Carbon\Carbon;
use Flarum\Extension\ExtensionManager;
use Flarum\Http\SlugManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Database\ConnectionInterface;

/**
 * Who is online, for the Online list.
 *
 * Online means what core means by it: seen in the last five minutes
 * (`User::isOnline()` on the frontend). `last_seen_at` is indexed and core
 * only rewrites it every three minutes, so the list is as fresh as the column
 * can be and no fresher.
 *
 * 🚨 Two halves, split on purpose:
 *
 * - WHO is online is the same for every viewer, so it is one cached query
 *   (plus the staff lookup) shared by the whole forum for a minute. It holds
 *   ids and two flags, nothing a viewer could be shown by mistake.
 * - WHAT a viewer may see of it is decided per request: the member's own
 *   "show when I am online" preference (core's `discloseOnline`), which staff
 *   with `user.viewLastSeenAt` may see past, exactly as core's `lastSeenAt`
 *   field does; and user visibility, through `whereVisibleTo`, in one query by
 *   primary key.
 */
class OnlineMembers
{
    /** Core's own definition of online, in seconds. */
    public const WINDOW = 300;

    /** How long the shared "who" list is kept. */
    public const TTL = 60;

    /** A ceiling on the shared list, whatever the forum's size. */
    public const SCAN = 200;

    private const CACHE_KEY = 'ernestdefoe-lobby.online';

    public function __construct(
        protected Cache $cache,
        protected ConnectionInterface $db,
        protected SettingsRepositoryInterface $settings,
        protected SlugManager $slugs,
        protected ExtensionManager $extensions,
    ) {
    }

    /**
     * @return array{staff: list<array<string, mixed>>, members: list<array<string, mixed>>, total: int}
     */
    public function forActor(User $actor): array
    {
        $seeHidden = $actor->hasPermission('user.viewLastSeenAt');

        $rows = array_values(array_filter(
            $this->rows(),
            fn (array $row) => $row['discloses'] || $seeHidden || $row['id'] === (int) $actor->id
        ));

        $total = count($rows);
        $limit = $this->limit();
        $rows = array_slice($rows, 0, $limit);

        if ($rows === []) {
            return ['staff' => [], 'members' => [], 'total' => 0];
        }

        /*
         * One query by primary key, through the forum's own visibility rules,
         * so an extension that hides members from some viewers hides them
         * here too.
         */
        $users = User::whereVisibleTo($actor)
            ->whereIn('id', array_column($rows, 'id'))
            ->get()
            ->keyBy('id');

        $activity = $this->activity($actor);

        $staff = [];
        $members = [];

        foreach ($rows as $row) {
            $user = $users->get($row['id']);

            if ($user === null) {
                $total--;
                continue;
            }

            $entry = [
                'id' => (int) $user->id,
                'displayName' => (string) $user->display_name,
                'slug' => $this->slugs->forResource(User::class)->toSlug($user),
                'avatarUrl' => $user->avatar_url,
                'color' => $user->color ?? null,
                'hidden' => ! $row['discloses'],
                'activity' => $activity[$user->id] ?? null,
            ];

            if ($row['staff']) {
                $staff[] = $entry;
            } else {
                $members[] = $entry;
            }
        }

        return ['staff' => $staff, 'members' => $members, 'total' => max(0, $total)];
    }

    /**
     * Every member seen in the window, newest first, shared by all viewers.
     *
     * @return list<array{id: int, discloses: bool, staff: bool}>
     */
    public function rows(): array
    {
        return $this->cache->remember(self::CACHE_KEY, self::TTL, function () {
            $users = User::query()
                ->where('last_seen_at', '>=', Carbon::now()->subSeconds(self::WINDOW))
                ->orderByDesc('last_seen_at')
                ->limit(self::SCAN)
                ->get(['id', 'preferences']);

            if ($users->isEmpty()) {
                return [];
            }

            $groups = $this->staffGroups();

            $staff = $groups === [] ? [] : array_flip(
                $this->db->table('group_user')
                    ->whereIn('user_id', $users->pluck('id')->all())
                    ->whereIn('group_id', $groups)
                    ->pluck('user_id')
                    ->map(fn ($id) => (int) $id)
                    ->all()
            );

            return $users->map(fn (User $user) => [
                'id' => (int) $user->id,
                'discloses' => (bool) $user->getPreference('discloseOnline'),
                'staff' => isset($staff[(int) $user->id]),
            ])->values()->all();
        });
    }

    /**
     * @return list<int>
     */
    public function staffGroups(): array
    {
        $raw = (string) $this->settings->get('ernestdefoe-lobby.staff_groups', '1,4');

        return array_values(array_unique(array_filter(
            array_map('intval', explode(',', $raw)),
            fn (int $id) => $id > 0
        )));
    }

    public function limit(): int
    {
        return max(5, min(100, (int) $this->settings->get('ernestdefoe-lobby.online_limit', 30)));
    }

    /**
     * What each member is doing, when ernestdefoe/presence is enabled.
     *
     * 🚨 A soft integration: the class is only touched when the extension is
     * enabled, and Presence decides per viewer what may be said — a member
     * reading somewhere this viewer cannot look is "browsing the forum".
     *
     * @return array<int, array<string, mixed>>
     */
    protected function activity(User $actor): array
    {
        $class = 'Ernestdefoe\\Presence\\ActivityStore';

        if (! $this->extensions->isEnabled('ernestdefoe-presence') || ! class_exists($class)) {
            return [];
        }

        if (! $actor->can('ernestdefoe-presence.viewOnline')) {
            return [];
        }

        $online = resolve($class)->online($actor);
        $map = [];

        foreach ($online['members'] ?? [] as $member) {
            if (isset($member['user']['id'])) {
                $map[(int) $member['user']['id']] = $member['activity'] ?? null;
            }
        }

        return $map;
    }
}
