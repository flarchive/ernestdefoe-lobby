import app from 'flarum/admin/app';
import Admin from 'flarum/common/extenders/Admin';
import Group from 'flarum/common/models/Group';

const t = (key: string, params: Record<string, any> = {}) => app.translator.trans(`ernestdefoe-lobby.admin.${key}`, params);

/*
 * 🚨 An Admin extender, not `app.extensionData` (gone in Flarum 2), and
 * exported from here ONLY: this file imports flarum/admin/app.
 *
 * 🚨 Every setting has a reader, named in extend.php beside its default.
 */
export const extend = [
  new Admin()
    // Read by the document stamp in extend.php and [data-lobby-accent].
    .setting(() => ({
      setting: 'ernestdefoe-lobby.accent',
      label: t('settings.accent_label'),
      help: t('settings.accent_help'),
      type: 'select',
      options: {
        amber: t('settings.accent_amber'),
        blue: t('settings.accent_blue'),
        green: t('settings.accent_green'),
        pink: t('settings.accent_pink'),
        primary: t('settings.accent_primary'),
      },
      default: 'amber',
    }))
    // Read by the Online column, the widgets and the phone layout.
    .setting(() => ({
      setting: 'ernestdefoe-lobby.show_online',
      label: t('settings.show_online_label'),
      help: t('settings.show_online_help'),
      type: 'boolean',
      default: true,
    }))
    // Read by OnlineMembers::limit().
    .setting(() => ({
      setting: 'ernestdefoe-lobby.online_limit',
      label: t('settings.online_limit_label'),
      help: t('settings.online_limit_help'),
      type: 'number',
      min: 5,
      max: 100,
      default: 30,
    }))
    // Read by OnlineMembers::staffGroups().
    .customSetting(function (this: any) {
      const stream = this.setting('ernestdefoe-lobby.staff_groups', '1,4');
      const chosen = new Set(
        String(stream() ?? '')
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean)
      );

      const toggle = (id: string, on: boolean) => {
        on ? chosen.add(id) : chosen.delete(id);
        stream(Array.from(chosen).join(','));
      };

      const groups = app.store.all<Group>('groups').filter((group) => group.id() !== Group.GUEST_ID && group.id() !== Group.MEMBER_ID);

      return (
        <div className="Form-group LobbyStaffGroups">
          <label>{t('settings.staff_groups_label')}</label>
          <div className="helpText">{t('settings.staff_groups_help')}</div>
          {groups.map((group) => (
            <label className="checkbox" key={group.id()}>
              <input
                type="checkbox"
                checked={chosen.has(group.id()!)}
                onchange={(e: Event) => toggle(group.id()!, (e.target as HTMLInputElement).checked)}
              />
              {group.namePlural()}
            </label>
          ))}
        </div>
      );
    })
    .permission(
      () => ({
        icon: 'fas fa-signal',
        label: t('permissions.view_online'),
        permission: 'ernestdefoe-lobby.viewOnline',
        allowGuest: true,
      }),
      'view'
    ),
];
