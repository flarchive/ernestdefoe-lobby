<?php

/*
 * This file is part of ernestdefoe/lobby.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace ErnestDefoe\Lobby\Api\Controller;

use ErnestDefoe\Lobby\Online\OnlineMembers;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /api/lobby/online — the Online list.
 *
 * A plain JSON shape rather than a JSON:API document: the list draws a face, a
 * name and a line of text per person, and has no use for the relationships,
 * links and store bookkeeping a full user resource would bring with it.
 */
class OnlineController implements RequestHandlerInterface
{
    public function __construct(protected OnlineMembers $online)
    {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('ernestdefoe-lobby.viewOnline');

        return new JsonResponse($this->online->forActor($actor));
    }
}
