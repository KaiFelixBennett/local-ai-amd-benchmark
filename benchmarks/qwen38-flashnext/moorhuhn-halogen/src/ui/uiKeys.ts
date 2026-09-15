import { addTranslations } from '../core/i18n';

/** Extra UI-only strings that the core i18n catalog does not cover. */
addTranslations('de', {
  'ui.not_enough_coins': 'Nicht genug Federtaler.',
  'ui.reset_settings_confirm': 'Wirklich alle Einstellungen zurücksetzen?',
  'ui.pick_a_binding': 'Binding ändern',
  'ui.level_max': 'Max. Level erreicht',
  'ui.elapsed': 'Verstrichen',
});

addTranslations('en', {
  'ui.not_enough_coins': 'Not enough feather coins.',
  'ui.reset_settings_confirm': 'Really reset all settings?',
  'ui.pick_a_binding': 'Change binding',
  'ui.level_max': 'Max level reached',
  'ui.elapsed': 'Elapsed',
});
