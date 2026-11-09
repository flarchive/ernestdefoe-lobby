<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

use Flarum\Database\Migration;
use Flarum\Group\Group;

// Everyone who can see the forum can see who is in it, until the owner says
// otherwise. Members who hide their online status are left out regardless.
return Migration::addPermissions([
    'ernestdefoe-lobby.viewOnline' => Group::GUEST_ID,
]);
