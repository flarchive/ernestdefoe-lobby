import app from 'flarum/forum/app';
import { override } from 'flarum/common/extend';
import SessionDropdown from 'flarum/forum/components/SessionDropdown';
import Icon from 'flarum/common/components/Icon';

import installShell from './shell';
import installIndexPage from './indexPage';
import installRows from './rows';
import registerOnlineWidgets from './widgets';
import { bootVisits } from './visits';
import installTopicPage from './topic/topicPage';
import installStreamDecor from './topic/streamDecor';

// NOTE: the admin extender is exported from js/src/admin/index.ts and NOWHERE
// else. It imports flarum/admin/app, which does not exist on the forum, and
// re-exporting it here would take the whole forum down during boot.

/*
 * Priority -100 so this runs AFTER other extensions' initializers: Lobby
 * wraps what flarum/tags and others have already added (the hero, the
 * sidebar's nav items, the composer's tag pre-fill) instead of being wrapped
 * by them.
 */
app.initializers.add(
  'ernestdefoe-lobby',
  () => {
    bootVisits();
    installShell();
    installIndexPage();
    installRows();
    installTopicPage();
    installStreamDecor();
    registerOnlineWidgets();

    // In the sidebar's user panel the session menu is a settings cog: the
    // avatar and name are already drawn beside it.
    override(SessionDropdown.prototype, 'getButtonContent', function (original: () => any) {
      return [<Icon name="fas fa-cog" className="Button-icon LobbySessionIcon" />, ...original()];
    });
  },
  -100
);
