import type { Language } from '../types';

const translations: Record<Language, Record<string, string>> = {
  de: {
    // Title
    title: 'Moorland Mayhem',
    subtitle: 'Featherstorm',

    // Menu
    menu_play: 'Spielen',
    menu_modes: 'Spielmodi',
    menu_environments: 'Schauplätze',
    menu_settings: 'Einstellungen',
    menu_stats: 'Statistiken',
    menu_highscores: 'Highscores',
    menu_achievements: 'Erfolge',
    menu_tutorial: 'Anleitung',
    menu_credits: 'Credits',
    menu_back: 'Zurück',
    menu_start: 'Starten',
    menu_pause: 'Pause',
    menu_resume: 'Weiter',
    menu_quit: 'Beenden',
    menu_confirm_quit: 'Möchtest du das Spiel wirklich beenden?',

    // Game Modes
    mode_classic: 'Classic Hunt',
    mode_classic_desc: '120 Sekunden, ausgewogene Standardrunde.',
    mode_blitz: 'Blitz',
    mode_blitz_desc: '60 Sekunden, hohe Spawnrate, schneller Multiplikator.',
    mode_precision: 'Precision',
    mode_precision_desc: 'Begrenzte Munition, kein auto Nachladen.',
    mode_endless: 'Endless',
    mode_endless_desc: 'Endlosmodus mit steigender Schwierigkeit.',
    mode_daily: 'Daily Challenge',
    mode_daily_desc: 'Täglich neuer Seed, reproduzierbare Runde.',
    mode_zen: 'Zen Hunt',
    mode_zen_desc: 'Entspannter Modus ohne harten Zeitdruck.',

    // Environments
    env_nebelmoor: 'Nebelmoor',
    env_nebelmoor_desc: 'Klassisches Moor mit Schilf, Wasser und Nebel.',
    env_sturmklippen: 'Sturmklippen',
    env_sturmklippen_desc: 'Küste mit starkem Wind und Leuchtturm.',
    env_mondbruch: 'Mondbruch',
    env_mondbruch_desc: 'Nächtliches mystisches Moor mit Vollmond.',
    env_locked: 'Freischaltung ab Level',

    // Targets
    target_moorflatterer: 'Moorflatterer',
    target_schnellfeder: 'Schnellfeder',
    target_korkenzieher: 'Korkenzieher',
    target_panzerpelz: 'Panzerpelz',
    target_goldschnabel: 'Goldschnabel',
    target_nebelfluesterer: 'Nebelflüsterer',
    target_taeuscher: 'Täuscher',
    target_schwarmvogel: 'Schwarmvogel',
    target_kurvensegler: 'Kurvensegler',
    target_sturmvogel: 'Sturmvogel',

    // Bosses
    boss_armored_moor: 'Gepanzerter Moorvogel',
    boss_acrobat: 'Akrobatikvogel',
    boss_night: 'Nachtvogel der Illusionen',

    // HUD
    hud_score: 'Punkte',
    hud_time: 'Zeit',
    hud_combo: 'Combo',
    hud_ammo: 'Munition',
    hud_perfect: 'PERFECT!',
    hud_reload: 'Nachladen...',
    hud_empty: 'LEER!',
    hud_event: 'Event',

    // Events
    event_fog: 'Dichter Nebel',
    event_fog_desc: 'Sichtbarkeit reduziert.',
    event_wind: 'Starker Wind',
    event_wind_desc: 'Flugbahnen werden beeinflusst.',
    event_thunder: 'Gewitter',
    event_thunder_desc: 'Blitze und Donner erschrecken die Ziele.',
    event_golden: 'Goldener Schwarm',
    event_golden_desc: 'Seltene Goldschnäbel erscheinen.',
    event_moon: 'Vollmond',
    event_moon_desc: 'Mystische Ereignisse werden verstärkt.',
    event_reed: 'Schilf-Start',
    event_reed_desc: 'Massenstart aus dem Schilf.',
    event_balloons: 'Bonusballons',
    event_balloons_desc: 'Ballons mit Bonus erscheinen.',
    event_rain: 'Regenfront',
    event_rain_desc: 'Wandernde Regenfront.',
    event_frog: 'Froschkonzert',
    event_frog_desc: 'Frösche konzertieren.',
    event_firefly: 'Glühwürmchen-Nacht',
    event_firefly_desc: 'Glühwürmchen leuchten.',
    event_timeslow: 'Zeitlupe',
    event_timeslow_desc: 'Alles verlangsamt sich.',
    event_miniboss: 'Mini-Boss',
    event_miniboss_desc: 'Ein starker Gegner erscheint.',
    event_featherstorm: 'Featherstorm',
    event_featherstorm_desc: 'Chaotischer Federsturm!',

    // Results
    results_title: 'Runde beendet',
    results_score: 'Gesamtpunktzahl',
    results_hits: 'Treffer',
    results_misses: 'Fehlschüsse',
    results_shots: 'Schüsse',
    results_accuracy: 'Trefferquote',
    results_perfect: 'Perfect Hits',
    results_max_combo: 'Höchste Combo',
    results_best_hit: 'Wertvollster Treffer',
    results_reaction: 'Reaktionszeit',
    results_targets: 'Getroffene Ziele',
    results_bonuses: 'Event-Boni',
    results_record: 'Persönlicher Rekord',
    results_new_record: 'NEUER REKORD!',
    results_rank: 'Rang',
    results_xp: 'Erhaltene XP',
    results_currency: 'Erhaltete Münzen',
    results_play_again: 'Nochmal',
    results_menu: 'Zum Menü',

    // Settings
    settings_title: 'Einstellungen',
    settings_language: 'Sprache',
    settings_quality: 'Qualität',
    settings_fullscreen: 'Fullscreen',
    settings_screenshake: 'Screenshake',
    settings_particles: 'Partikeldichte',
    settings_crosshair_size: 'Fadenkreuzgröße',
    settings_crosshair_color: 'Fadenkreuzfarbe',
    settings_colorblind: 'Rot-Grün-Sehschwäche',
    settings_reduced_motion: 'Reduzierte Bewegung',
    settings_reduced_flashes: 'Reduzierte Blitze',
    settings_master_volume: 'Gesamtlautstärke',
    settings_music_volume: 'Musik',
    settings_sfx_volume: 'Soundeffekte',
    settings_ambient_volume: 'Umgebung',
    settings_save: 'Speichern',
    settings_reset: 'Zurücksetzen',
    quality_low: 'Niedrig',
    quality_medium: 'Mittel',
    quality_high: 'Hoch',

    // Stats
    stats_title: 'Statistiken',
    stats_total_rounds: 'Gesamte Runden',
    stats_total_hits: 'Gesamte Treffer',
    stats_total_shots: 'Gesamte Schüsse',
    stats_accuracy: 'Gesamt-Trefferquote',
    stats_perfect_hits: 'Perfect Hits',
    stats_max_combo: 'Höchste Combo',
    stats_total_score: 'Gesamtpunktzahl',
    stats_level: 'Level',
    stats_xp: 'Erfahrung',
    stats_currency: 'Münzen',

    // Achievements
    achievements_title: 'Erfolge',
    achievement_first_blood: 'Erster Blut',
    achievement_first_blood_desc: 'Ersten Treffer landen.',
    achievement_perfect_5: 'Perfektionist',
    achievement_perfect_5_desc: '5 Perfect Hits hintereinander.',
    achievement_combo_20: 'Combo-König',
    achievement_combo_20_desc: 'Combo von 20 erreichen.',
    achievement_rank_s: 'S-Rang',
    achievement_rank_s_desc: 'S-Rang in einer Runde erreichen.',
    achievement_100_shots: 'Scharfschütze',
    achievement_100_shots_desc: '100 Treffer ohne Fehlschuss.',
    achievement_all_targets: 'Vogelkenner',
    achievement_all_targets_desc: 'Alle Zielarten treffen.',
    achievement_first_boss: 'Boss-Sieger',
    achievement_first_boss_desc: 'Ersten Mini-Boss besiegen.',

    // Tutorial
    tutorial_title: 'Willkommen bei Moorland Mayhem!',
    tutorial_step1: 'Bewege die Maus, um das Fadenkreuz zu steuern.',
    tutorial_step2: 'Klicke mit der Linksmaske, um zu schießen.',
    tutorial_step3: 'Drücke R oder rechte Maustaste zum Nachladen.',
    tutorial_step4: 'Treffe die fliegenden Ziele für Punkte!',
    tutorial_step5: 'Combos geben mehr Punkte. Verpasse keine Schüsse!',
    tutorial_step6: 'Viel Spaß beim Jagen!',
    tutorial_next: 'Weiter',
    tutorial_start: 'Los geht\'s!',

    // Misc
    unlocked: 'Freigeschaltet!',
    level: 'Level',
    xp: 'XP',
    currency: 'Münzen',
    best: 'Bestwert',
    daily_best: 'Tagesbestwert',
  },
  en: {
    // Title
    title: 'Moorland Mayhem',
    subtitle: 'Featherstorm',

    // Menu
    menu_play: 'Play',
    menu_modes: 'Game Modes',
    menu_environments: 'Environments',
    menu_settings: 'Settings',
    menu_stats: 'Statistics',
    menu_highscores: 'High Scores',
    menu_achievements: 'Achievements',
    menu_tutorial: 'Tutorial',
    menu_credits: 'Credits',
    menu_back: 'Back',
    menu_start: 'Start',
    menu_pause: 'Pause',
    menu_resume: 'Resume',
    menu_quit: 'Quit',
    menu_confirm_quit: 'Do you really want to quit?',

    // Game Modes
    mode_classic: 'Classic Hunt',
    mode_classic_desc: '120 seconds, balanced standard round.',
    mode_blitz: 'Blitz',
    mode_blitz_desc: '60 seconds, high spawn rate, fast multiplier.',
    mode_precision: 'Precision',
    mode_precision_desc: 'Limited ammo, no auto reload.',
    mode_endless: 'Endless',
    mode_endless_desc: 'Endless mode with increasing difficulty.',
    mode_daily: 'Daily Challenge',
    mode_daily_desc: 'New daily seed, reproducible round.',
    mode_zen: 'Zen Hunt',
    mode_zen_desc: 'Relaxed mode without hard time pressure.',

    // Environments
    env_nebelmoor: 'Mist Moor',
    env_nebelmoor_desc: 'Classic moor with reeds, water and fog.',
    env_sturmklippen: 'Storm Cliffs',
    env_sturmklippen_desc: 'Coast with strong wind and lighthouse.',
    env_mondbruch: 'Moonbreak',
    env_mondbruch_desc: 'Nighttime mystical moor with full moon.',
    env_locked: 'Unlocks at Level',

    // Targets
    target_moorflatterer: 'Moor Flapper',
    target_schnellfeder: 'Swift Feather',
    target_korkenzieher: 'Corkscrew',
    target_panzerpelz: 'Armored Fur',
    target_goldschnabel: 'Gold Beak',
    target_nebelfluesterer: 'Fog Whisperer',
    target_taeuscher: 'Deceiver',
    target_schwarmvogel: 'Flock Bird',
    target_kurvensegler: 'Curve Glider',
    target_sturmvogel: 'Storm Bird',

    // Bosses
    boss_armored_moor: 'Armored Moorbird',
    boss_acrobat: 'Acrobat Bird',
    boss_night: 'Night Bird of Illusions',

    // HUD
    hud_score: 'Score',
    hud_time: 'Time',
    hud_combo: 'Combo',
    hud_ammo: 'Ammo',
    hud_perfect: 'PERFECT!',
    hud_reload: 'Reloading...',
    hud_empty: 'EMPTY!',
    hud_event: 'Event',

    // Events
    event_fog: 'Thick Fog',
    event_fog_desc: 'Visibility reduced.',
    event_wind: 'Strong Wind',
    event_wind_desc: 'Flight paths affected.',
    event_thunder: 'Thunderstorm',
    event_thunder_desc: 'Lightning startles targets.',
    event_golden: 'Golden Swarm',
    event_golden_desc: 'Rare Gold Beaks appear.',
    event_moon: 'Full Moon',
    event_moon_desc: 'Mystical events enhanced.',
    event_reed: 'Reed Spawn',
    event_reed_desc: 'Mass spawn from the reeds.',
    event_balloons: 'Bonus Balloons',
    event_balloons_desc: 'Bonus balloons appear.',
    event_rain: 'Rain Front',
    event_rain_desc: 'Moving rain front.',
    event_frog: 'Frog Concert',
    event_frog_desc: 'Frogs are performing.',
    event_firefly: 'Firefly Night',
    event_firefly_desc: 'Fireflies glow.',
    event_timeslow: 'Slow Motion',
    event_timeslow_desc: 'Everything slows down.',
    event_miniboss: 'Mini Boss',
    event_miniboss_desc: 'A powerful enemy appears.',
    event_featherstorm: 'Featherstorm',
    event_featherstorm_desc: 'Chaotic feather storm!',

    // Results
    results_title: 'Round Over',
    results_score: 'Total Score',
    results_hits: 'Hits',
    results_misses: 'Misses',
    results_shots: 'Shots',
    results_accuracy: 'Accuracy',
    results_perfect: 'Perfect Hits',
    results_max_combo: 'Max Combo',
    results_best_hit: 'Best Hit',
    results_reaction: 'Reaction Time',
    results_targets: 'Targets Hit',
    results_bonuses: 'Event Bonuses',
    results_record: 'Personal Best',
    results_new_record: 'NEW RECORD!',
    results_rank: 'Rank',
    results_xp: 'XP Earned',
    results_currency: 'Coins Earned',
    results_play_again: 'Play Again',
    results_menu: 'To Menu',

    // Settings
    settings_title: 'Settings',
    settings_language: 'Language',
    settings_quality: 'Quality',
    settings_fullscreen: 'Fullscreen',
    settings_screenshake: 'Screenshake',
    settings_particles: 'Particle Density',
    settings_crosshair_size: 'Crosshair Size',
    settings_crosshair_color: 'Crosshair Color',
    settings_colorblind: 'Colorblind Mode',
    settings_reduced_motion: 'Reduced Motion',
    settings_reduced_flashes: 'Reduced Flashes',
    settings_master_volume: 'Master Volume',
    settings_music_volume: 'Music',
    settings_sfx_volume: 'Sound Effects',
    settings_ambient_volume: 'Ambient',
    settings_save: 'Save',
    settings_reset: 'Reset',
    quality_low: 'Low',
    quality_medium: 'Medium',
    quality_high: 'High',

    // Stats
    stats_title: 'Statistics',
    stats_total_rounds: 'Total Rounds',
    stats_total_hits: 'Total Hits',
    stats_total_shots: 'Total Shots',
    stats_accuracy: 'Overall Accuracy',
    stats_perfect_hits: 'Perfect Hits',
    stats_max_combo: 'Max Combo',
    stats_total_score: 'Total Score',
    stats_level: 'Level',
    stats_xp: 'Experience',
    stats_currency: 'Coins',

    // Achievements
    achievements_title: 'Achievements',
    achievement_first_blood: 'First Blood',
    achievement_first_blood_desc: 'Land your first hit.',
    achievement_perfect_5: 'Perfectionist',
    achievement_perfect_5_desc: '5 Perfect Hits in a row.',
    achievement_combo_20: 'Combo King',
    achievement_combo_20_desc: 'Reach a combo of 20.',
    achievement_rank_s: 'S-Rank',
    achievement_rank_s_desc: 'Achieve S-Rank in a round.',
    achievement_100_shots: 'Sharpshooter',
    achievement_100_shots_desc: '100 hits without a miss.',
    achievement_all_targets: 'Bird Expert',
    achievement_all_targets_desc: 'Hit all target types.',
    achievement_first_boss: 'Boss Slayer',
    achievement_first_boss_desc: 'Defeat your first mini-boss.',

    // Tutorial
    tutorial_title: 'Welcome to Moorland Mayhem!',
    tutorial_step1: 'Move your mouse to control the crosshair.',
    tutorial_step2: 'Left-click to shoot.',
    tutorial_step3: 'Press R or right-click to reload.',
    tutorial_step4: 'Hit flying targets for points!',
    tutorial_step5: 'Combos give more points. Don\'t miss!',
    tutorial_step6: 'Happy hunting!',
    tutorial_next: 'Next',
    tutorial_start: 'Let\'s Go!',

    // Misc
    unlocked: 'Unlocked!',
    level: 'Level',
    xp: 'XP',
    currency: 'Coins',
    best: 'Best',
    daily_best: 'Daily Best',
  },
};

export function detectLanguage(): Language {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('en')) return 'en';
  if (browserLang.startsWith('de')) return 'de';
  return 'de'; // fallback
}

export function t(key: string, lang?: Language): string {
  const l = lang ?? getCurrentLang();
  return translations[l]?.[key] ?? translations['de']?.[key] ?? key;
}

let currentLang: Language = detectLanguage();

export function getCurrentLang(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
}
