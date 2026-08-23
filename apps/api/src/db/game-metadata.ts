/**
 * Curated technical metadata for the imported game catalogue: developer,
 * publisher, engine, graphics API and release year.
 *
 * The imported catalogue carries only a name (see catalog-metadata.ts), so
 * every game shipped with these fields null and the game-detail page had
 * nothing to show beyond genres. This table was built by two independent
 * LLM passes per game, keeping only fields where both passes agreed — a
 * wrong studio or engine shown to a user is worse than a blank field, so
 * disagreements were dropped rather than guessed at. 311 of 313 games have
 * at least one confirmed field; apply-game-metadata.ts replays this table.
 *
 * Slugs on the left must match games.slug.
 */
export interface CuratedGameMeta {
  developer: string | null;
  publisher: string | null;
  engine: string | null;
  api: string | null;
  releaseYear: number | null;
}

export const GAME_METADATA: Record<string, CuratedGameMeta> = {
  'a-plague-tale-innocence': { developer: 'Asobo Studio', publisher: 'Focus Home Interactive', engine: null, api: 'DirectX 11', releaseYear: 2019 }, // A Plague Tale Innocence
  'a-plague-tale-requiem': { developer: 'Asobo Studio', publisher: 'Focus Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2022 }, // A Plague Tale - Requiem
  'age-of-empires-iii': { developer: 'Ensemble Studios', publisher: 'Microsoft Game Studios', engine: 'BANG! Engine', api: 'DirectX 9', releaseYear: 2005 }, // Age of Empires III
  'age-of-empires-iv': { developer: 'Relic Entertainment', publisher: 'Xbox Game Studios', engine: 'Essence Engine', api: 'DirectX 12', releaseYear: 2021 }, // Age of Empires IV
  'age-of-mythology-retold': { developer: null, publisher: 'Xbox Game Studios', engine: null, api: null, releaseYear: 2024 }, // Age of Mythology Retold
  'alan-wake': { developer: 'Remedy Entertainment', publisher: 'Remedy Entertainment', engine: null, api: null, releaseYear: 2012 }, // Alan Wake
  'alan-wake-2': { developer: 'Remedy Entertainment', publisher: 'Epic Games Publishing', engine: 'Northlight Engine', api: 'DirectX 12', releaseYear: 2023 }, // Alan Wake 2
  'alien-isolation': { developer: 'Creative Assembly', publisher: 'Sega', engine: null, api: 'DirectX 11', releaseYear: 2014 }, // Alien Isolation
  'american-truck-simulator': { developer: 'SCS Software', publisher: 'SCS Software', engine: 'Prism3D', api: 'DirectX 11 / OpenGL', releaseYear: 2016 }, // American Truck Simulator
  'apex-legends': { developer: 'Respawn Entertainment', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11', releaseYear: 2019 }, // Apex Legends
  'arena-breakout-infinite': { developer: 'MoreFun Studios', publisher: null, engine: null, api: null, releaseYear: null }, // Arena Breakout Infinite
  'ark-scorched-earth': { developer: 'Studio Wildcard', publisher: 'Studio Wildcard', engine: 'Unreal Engine 4', api: 'DirectX 11', releaseYear: 2016 }, // ARK Scorched Earth
  'assassin-creed-mirage': { developer: 'Ubisoft Bordeaux', publisher: 'Ubisoft', engine: 'Anvil', api: 'DirectX 12', releaseYear: 2023 }, // Assassin Creed Mirage
  'assassin-s-creed-brotherhood': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Anvil', api: null, releaseYear: 2011 }, // Assassin's Creed Brotherhood
  'assassin-s-creed-chronicles-china': { developer: 'Climax Studios', publisher: 'Ubisoft', engine: 'Unreal Engine 3', api: null, releaseYear: 2015 }, // Assassin's Creed Chronicles China
  'assassin-s-creed-iii': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'AnvilNext', api: null, releaseYear: 2012 }, // Assassin's Creed III
  'assassin-s-creed-iv-black-flag-freedom-cry': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'AnvilNext', api: 'DirectX 11', releaseYear: 2014 }, // Assassin's Creed IV Black Flag - Freedom Cry
  'assassin-s-creed-revelations': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Anvil', api: null, releaseYear: 2011 }, // Assassin's Creed Revelations
  'assassin-s-creed-shadows': { developer: 'Ubisoft Quebec', publisher: 'Ubisoft', engine: 'Anvil', api: 'DirectX 12', releaseYear: 2025 }, // Assassin's Creed Shadows
  'assassin-s-creed-syndicate': { developer: 'Ubisoft Quebec', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11', releaseYear: 2015 }, // Assassin's Creed - Syndicate
  'assassin-s-creed-syndicate-2': { developer: 'Ubisoft Quebec', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11', releaseYear: 2015 }, // Assassin's Creed Syndicate
  'assassin-s-creed-unity': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11', releaseYear: 2014 }, // Assassin's Creed - Unity
  'assassins-creed-odyssey': { developer: 'Ubisoft Quebec', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11', releaseYear: 2018 }, // Assassins Creed Odyssey
  'assassins-creed-origins': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11', releaseYear: 2017 }, // Assassins Creed Origins
  'assassins-creed-valhalla': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: null, api: 'DirectX 12', releaseYear: 2020 }, // Assassins Creed Valhalla
  'assetto-corsa': { developer: 'Kunos Simulazioni', publisher: '505 Games', engine: null, api: 'DirectX 11', releaseYear: 2014 }, // Assetto Corsa
  'atomic-heart': { developer: 'Mundfish', publisher: 'Focus Entertainment', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2023 }, // Atomic Heart
  'avatar-frontiers-of-pandora': { developer: 'Massive Entertainment', publisher: 'Ubisoft', engine: 'Snowdrop', api: 'DirectX 12', releaseYear: 2023 }, // Avatar Frontiers of Pandora
  'avowed': { developer: 'Obsidian Entertainment', publisher: 'Xbox Game Studios', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Avowed
  'baldur-s-gate-3': { developer: 'Larian Studios', publisher: 'Larian Studios', engine: null, api: 'DirectX 11 / Vulkan', releaseYear: 2023 }, // Baldur's Gate 3
  'baldurs-gate-3-no-sub': { developer: 'Larian Studios', publisher: 'Larian Studios', engine: null, api: 'DirectX 11 / Vulkan', releaseYear: 2023 }, // Baldurs Gate 3 No Sub
  'batman-arkham-city-goty': { developer: 'Rocksteady Studios', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Unreal Engine 3', api: null, releaseYear: 2011 }, // Batman Arkham City GOTY
  'batman-arkham-origins': { developer: 'WB Games Montreal', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Unreal Engine 3', api: null, releaseYear: 2013 }, // Batman Arkham Origins
  'battlefield-1': { developer: 'DICE', publisher: 'Electronic Arts', engine: 'Frostbite 3', api: 'DirectX 11 / DirectX 12', releaseYear: 2016 }, // Battlefield 1
  'battlefield-2': { developer: 'DICE', publisher: 'Electronic Arts', engine: 'Refractor 2', api: 'DirectX 9', releaseYear: 2005 }, // Battlefield 2
  'battlefield-2042': { developer: 'DICE', publisher: 'Electronic Arts', engine: 'Frostbite', api: 'DirectX 12', releaseYear: 2021 }, // Battlefield 2042
  'battlefield-3': { developer: 'DICE', publisher: 'Electronic Arts', engine: 'Frostbite 2', api: null, releaseYear: 2011 }, // Battlefield 3
  'battlefield-4': { developer: 'DICE', publisher: 'Electronic Arts', engine: 'Frostbite 3', api: 'DirectX 11', releaseYear: 2013 }, // Battlefield 4
  'battlefield-hardline': { developer: 'Visceral Games', publisher: 'Electronic Arts', engine: 'Frostbite 3', api: 'DirectX 11', releaseYear: 2015 }, // Battlefield Hardline
  'battlefield-v': { developer: 'DICE', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11 / DirectX 12', releaseYear: 2018 }, // Battlefield V
  'beamng-drive': { developer: 'BeamNG GmbH', publisher: 'BeamNG GmbH', engine: 'Torque3D', api: 'DirectX 11', releaseYear: null }, // BeamNG.drive
  'beast-of-reincarnation': { developer: 'Game Freak', publisher: null, engine: null, api: null, releaseYear: null }, // Beast of Reincarnation
  'beyond-two-souls': { developer: 'Quantic Dream', publisher: 'Quantic Dream', engine: null, api: null, releaseYear: 2019 }, // Beyond Two Souls
  'biomutant': { developer: 'Experiment 101', publisher: 'THQ Nordic', engine: 'Unreal Engine 4', api: 'DirectX 11', releaseYear: 2021 }, // Biomutant
  'bioshock-2': { developer: '2K Marin', publisher: '2K Games', engine: 'Unreal Engine 2.5', api: 'DirectX 9 / DirectX 10', releaseYear: 2010 }, // BioShock 2
  'black-myth-wukong': { developer: 'Game Science', publisher: 'Game Science', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Black Myth Wukong
  'blair-witch': { developer: 'Bloober Team', publisher: 'Bloober Team', engine: 'Unreal Engine 4', api: 'DirectX 11', releaseYear: 2019 }, // Blair Witch
  'bloodborne': { developer: 'FromSoftware', publisher: null, engine: null, api: null, releaseYear: null }, // Bloodborne
  'bodycam': { developer: 'Reissad Studio', publisher: 'Reissad Studio', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Bodycam
  'borderlands-4': { developer: 'Gearbox Software', publisher: '2K Games', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Borderlands 4
  'bright-memory': { developer: null, publisher: null, engine: 'Unreal Engine 4', api: 'DirectX 11 / DirectX 12', releaseYear: 2019 }, // Bright Memory
  'call-of-duty-advanced-warfare': { developer: 'Sledgehammer Games', publisher: 'Activision', engine: 'IW engine', api: 'DirectX 11', releaseYear: 2014 }, // Call of Duty Advanced Warfare
  'call-of-duty-black-ops-3': { developer: 'Treyarch', publisher: 'Activision', engine: 'IW engine', api: 'DirectX 11', releaseYear: 2015 }, // Call of Duty - Black Ops 3
  'call-of-duty-black-ops-6': { developer: 'Treyarch', publisher: 'Activision', engine: 'IW 9.0', api: 'DirectX 12', releaseYear: 2024 }, // Call of Duty Black Ops 6
  'call-of-duty-black-ops-cold-war': { developer: 'Treyarch', publisher: 'Activision', engine: 'IW 8.0', api: 'DirectX 12', releaseYear: 2020 }, // Call of Duty Black Ops Cold War
  'call-of-duty-black-ops-ii': { developer: 'Treyarch', publisher: 'Activision', engine: 'IW engine', api: 'DirectX 11', releaseYear: 2012 }, // Call of Duty Black Ops II
  'call-of-duty-modern-warfare': { developer: 'Infinity Ward', publisher: 'Activision', engine: 'IW 8.0', api: 'DirectX 12', releaseYear: 2019 }, // Call of Duty Modern Warfare
  'call-of-duty-modern-warfare-3': { developer: 'Infinity Ward', publisher: 'Activision', engine: 'IW 5.0', api: 'DirectX 9', releaseYear: 2011 }, // Call of Duty Modern Warfare 3
  'call-of-duty-modern-warfare-ii': { developer: 'Infinity Ward', publisher: 'Activision', engine: 'IW 9.0', api: 'DirectX 12', releaseYear: 2022 }, // Call of Duty Modern Warfare II
  'call-of-duty-modern-warfare-iii': { developer: 'Sledgehammer Games', publisher: 'Activision', engine: 'IW 9.0', api: 'DirectX 12', releaseYear: 2023 }, // Call of Duty Modern Warfare III
  'call-of-duty-vanguard': { developer: 'Sledgehammer Games', publisher: 'Activision', engine: 'IW 8.0', api: 'DirectX 12', releaseYear: 2021 }, // Call of Duty Vanguard
  'call-of-duty-warzone': { developer: null, publisher: 'Activision', engine: 'IW 8.0', api: 'DirectX 12', releaseYear: 2020 }, // Call of Duty Warzone
  'call-of-duty-wwii': { developer: 'Sledgehammer Games', publisher: 'Activision', engine: 'IW engine', api: 'DirectX 11', releaseYear: 2017 }, // Call of Duty WWII
  'call-of-juarez-the-cartel': { developer: 'Techland', publisher: 'Ubisoft', engine: 'Chrome Engine 5', api: null, releaseYear: 2011 }, // Call of Juarez The Cartel
  'castlevania-lords-of-shadow-ue': { developer: 'MercurySteam', publisher: 'Konami', engine: null, api: null, releaseYear: 2013 }, // Castlevania - Lords of Shadow UE
  'clair-obscur-expedition-33': { developer: 'Sandfall Interactive', publisher: 'Kepler Interactive', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Clair Obscur Expedition 33
  'colin-mcrae-dirt-2': { developer: 'Codemasters', publisher: 'Codemasters', engine: 'EGO Engine', api: 'DirectX 9 / DirectX 11', releaseYear: 2009 }, // Colin McRae Dirt 2
  'colin-mcrae-rally-and-dirt': { developer: 'Codemasters', publisher: 'Codemasters', engine: null, api: null, releaseYear: null }, // Colin McRae Rally and Dirt
  'control': { developer: 'Remedy Entertainment', publisher: '505 Games', engine: 'Northlight Engine', api: 'DirectX 11 / DirectX 12', releaseYear: 2019 }, // Control
  'counter-strike-2': { developer: 'Valve', publisher: 'Valve', engine: 'Source 2', api: 'DirectX 11 / Vulkan', releaseYear: 2023 }, // Counter-Strike 2
  'crash-bandicoot-4-it-s-about-time': { developer: 'Toys for Bob', publisher: 'Activision', engine: 'Unreal Engine 4', api: null, releaseYear: 2021 }, // Crash Bandicoot 4 It's About Time
  'crimson-desert': { developer: 'Pearl Abyss', publisher: 'Pearl Abyss', engine: 'BlackSpace Engine', api: null, releaseYear: null }, // Crimson Desert
  'crysis': { developer: 'Crytek', publisher: 'Electronic Arts', engine: 'CryEngine 2', api: 'DirectX 9 / DirectX 10', releaseYear: 2007 }, // Crysis
  'crysis-2': { developer: 'Crytek', publisher: 'Electronic Arts', engine: 'CryEngine 3', api: 'DirectX 9 / DirectX 11', releaseYear: 2011 }, // Crysis 2
  'cuphead': { developer: 'Studio MDHR', publisher: 'Studio MDHR', engine: 'Unity', api: null, releaseYear: 2017 }, // Cuphead
  'cyberpunk-2077': { developer: 'CD Projekt Red', publisher: 'CD Projekt', engine: 'REDengine 4', api: 'DirectX 12', releaseYear: 2020 }, // Cyberpunk 2077
  'dante-s-inferno': { developer: 'Visceral Games', publisher: 'Electronic Arts', engine: null, api: null, releaseYear: null }, // Dante's Inferno
  'dark-souls': { developer: 'FromSoftware', publisher: 'Bandai Namco Entertainment', engine: null, api: 'DirectX 9', releaseYear: 2012 }, // Dark Souls
  'dark-souls-2-scholar-of-the-first-sin': { developer: 'FromSoftware', publisher: 'Bandai Namco Entertainment', engine: null, api: 'DirectX 11', releaseYear: 2015 }, // Dark Souls 2 - Scholar of the First Sin
  'dark-souls-iii': { developer: 'FromSoftware', publisher: 'Bandai Namco Entertainment', engine: null, api: 'DirectX 11', releaseYear: 2016 }, // Dark Souls III
  'days-gone': { developer: 'Bend Studio', publisher: 'Sony Interactive Entertainment', engine: 'Unreal Engine 4', api: 'DirectX 11', releaseYear: 2021 }, // Days Gone
  'days-gone-remastered': { developer: 'Bend Studio', publisher: 'Sony Interactive Entertainment', engine: 'Unreal Engine 4', api: null, releaseYear: null }, // Days Gone Remastered
  'dead-island-2': { developer: 'Dambuster Studios', publisher: 'Deep Silver', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2023 }, // dead island 2
  'death-stranding': { developer: 'Kojima Productions', publisher: '505 Games', engine: 'Decima', api: 'DirectX 12', releaseYear: 2020 }, // Death Stranding
  'deathloop': { developer: 'Arkane Lyon', publisher: 'Bethesda Softworks', engine: 'Void Engine', api: 'DirectX 12', releaseYear: 2021 }, // Deathloop
  'delta-force': { developer: 'Team Jade', publisher: null, engine: null, api: null, releaseYear: 2024 }, // Delta Force
  'detroit-become-human': { developer: 'Quantic Dream', publisher: 'Quantic Dream', engine: null, api: null, releaseYear: 2019 }, // Detroit - Become Human
  'deus-ex-human-revolution': { developer: 'Eidos-Montréal', publisher: 'Square Enix', engine: 'Crystal Engine', api: 'DirectX 9', releaseYear: 2011 }, // Deus Ex Human Revolution
  'devil-may-cry-5': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 12', releaseYear: 2019 }, // Devil May Cry 5
  'dirt-3': { developer: 'Codemasters', publisher: 'Codemasters', engine: 'EGO Engine', api: 'DirectX 9 / DirectX 11', releaseYear: 2011 }, // Dirt 3
  'dirt-5': { developer: 'Codemasters', publisher: 'Codemasters', engine: 'EGO Engine', api: 'DirectX 12', releaseYear: 2020 }, // Dirt 5
  'dirt-rally-2-0': { developer: 'Codemasters', publisher: 'Codemasters', engine: 'EGO Engine', api: 'DirectX 11', releaseYear: 2019 }, // DiRT Rally 2.0
  'dishonored': { developer: 'Arkane Studios', publisher: 'Bethesda Softworks', engine: 'Unreal Engine 3', api: 'DirectX 9', releaseYear: 2012 }, // Dishonored
  'doom-eternal': { developer: 'id Software', publisher: 'Bethesda Softworks', engine: 'id Tech 7', api: 'Vulkan', releaseYear: 2020 }, // DOOM Eternal
  'doom-the-dark-ages': { developer: 'id Software', publisher: 'Bethesda Softworks', engine: 'id Tech 8', api: 'Vulkan', releaseYear: 2025 }, // DOOM The Dark Ages
  'doomthedarkages': { developer: 'id Software', publisher: 'Bethesda Softworks', engine: 'id Tech 8', api: 'Vulkan', releaseYear: 2025 }, // DOOMTheDarkAges
  'dragon-age-ii': { developer: 'BioWare', publisher: 'Electronic Arts', engine: 'Eclipse Engine', api: 'DirectX 9 / DirectX 11', releaseYear: 2011 }, // Dragon Age II
  'dragon-age-inquisition': { developer: 'BioWare', publisher: 'Electronic Arts', engine: 'Frostbite 3', api: 'DirectX 11', releaseYear: 2014 }, // Dragon Age - Inquisition
  'dragon-age-inquisition-2': { developer: 'BioWare', publisher: 'Electronic Arts', engine: 'Frostbite 3', api: 'DirectX 11', releaseYear: 2014 }, // Dragon Age Inquisition
  'dragons-dogma-2': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 12', releaseYear: 2024 }, // Dragons Dogma 2
  'dying-light': { developer: 'Techland', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Chrome Engine 6', api: 'DirectX 11', releaseYear: 2015 }, // Dying Light
  'dying-light-2': { developer: 'Techland', publisher: 'Techland', engine: 'C-Engine', api: 'DirectX 12', releaseYear: 2022 }, // Dying Light 2
  'dying-light-2-stay-human': { developer: 'Techland', publisher: 'Techland', engine: 'C-Engine', api: 'DirectX 12', releaseYear: 2022 }, // Dying Light 2 Stay Human
  'dying-light-the-beast': { developer: 'Techland', publisher: 'Techland', engine: 'C-Engine', api: 'DirectX 12', releaseYear: 2025 }, // Dying Light The Beast
  'ea-sports-fc-24': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: 'DirectX 12', releaseYear: 2023 }, // EA Sports FC 24
  'ea-sports-fc-25': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: 'DirectX 12', releaseYear: 2024 }, // EA SPORTS FC™ 25
  'elden-ring-nightreign': { developer: 'FromSoftware', publisher: 'Bandai Namco Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2025 }, // Elden Ring Nightreign
  'elden-ring-shadow-of-the-erdtree': { developer: 'FromSoftware', publisher: 'Bandai Namco Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2024 }, // ELDEN RING Shadow of the Erdtree
  'evil-west': { developer: 'Flying Wild Hog', publisher: 'Focus Entertainment', engine: 'Unreal Engine 4', api: null, releaseYear: 2022 }, // Evil West
  'fallout-3': { developer: 'Bethesda Game Studios', publisher: 'Bethesda Softworks', engine: 'Gamebryo', api: 'DirectX 9', releaseYear: 2008 }, // Fallout 3
  'fallout-76': { developer: 'Bethesda Game Studios', publisher: 'Bethesda Softworks', engine: 'Creation Engine', api: 'DirectX 11', releaseYear: 2018 }, // Fallout 76
  'far-cry-3': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Dunia Engine 2', api: 'DirectX 9 / DirectX 11', releaseYear: 2012 }, // Far Cry 3
  'far-cry-4': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Dunia Engine 2', api: 'DirectX 11', releaseYear: 2014 }, // Far Cry 4
  'far-cry-6': { developer: 'Ubisoft Toronto', publisher: 'Ubisoft', engine: 'Dunia Engine', api: 'DirectX 12', releaseYear: 2021 }, // Far Cry 6
  'far-cry-new-dawn': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Dunia Engine', api: 'DirectX 11', releaseYear: 2019 }, // Far Cry New Dawn
  'fifa-18': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: null, releaseYear: 2017 }, // FIFA 18
  'fifa-19': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: null, releaseYear: 2018 }, // FIFA 19
  'fifa-20': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: null, releaseYear: 2019 }, // FIFA 20
  'fifa-22': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: 'DirectX 12', releaseYear: 2021 }, // FIFA 22
  'fifa-23': { developer: 'EA Vancouver', publisher: null, engine: 'Frostbite', api: 'DirectX 12', releaseYear: 2022 }, // FIFA 23
  'final-fantasy-vii-remake-intergrade': { developer: 'Square Enix', publisher: 'Square Enix', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2021 }, // Final Fantasy VII - Remake Intergrade
  'final-fantasy-xvi': { developer: 'Square Enix Creative Business Unit III', publisher: 'Square Enix', engine: null, api: 'DirectX 12', releaseYear: 2024 }, // Final Fantasy XVI
  'forspoken': { developer: 'Luminous Productions', publisher: 'Square Enix', engine: 'Luminous Engine', api: 'DirectX 12', releaseYear: 2023 }, // Forspoken
  'forspoken-no-sub': { developer: 'Luminous Productions', publisher: 'Square Enix', engine: 'Luminous Engine', api: 'DirectX 12', releaseYear: 2023 }, // Forspoken No Sub
  'fortnite': { developer: 'Epic Games', publisher: 'Epic Games', engine: 'Unreal Engine 5', api: 'DirectX 11 / DirectX 12', releaseYear: 2017 }, // Fortnite
  'forza-horizon-2': { developer: 'Playground Games', publisher: 'Microsoft Studios', engine: 'ForzaTech', api: null, releaseYear: null }, // Forza Horizon 2
  'forza-horizon-3': { developer: 'Playground Games', publisher: 'Microsoft Studios', engine: 'ForzaTech', api: 'DirectX 12', releaseYear: 2016 }, // Forza Horizon 3
  'forza-horizon-4': { developer: 'Playground Games', publisher: 'Microsoft Studios', engine: 'ForzaTech', api: 'DirectX 12', releaseYear: 2018 }, // Forza Horizon 4
  'forza-horizon-6': { developer: 'Playground Games', publisher: 'Xbox Game Studios', engine: null, api: null, releaseYear: null }, // Forza Horizon 6
  'forza-motorsport': { developer: 'Turn 10 Studios', publisher: 'Xbox Game Studios', engine: 'ForzaTech', api: 'DirectX 12', releaseYear: 2023 }, // Forza Motorsport
  'frostpunk': { developer: '11 bit studios', publisher: '11 bit studios', engine: 'Liquid Engine', api: 'DirectX 11', releaseYear: 2018 }, // Frostpunk
  'frostpunk-2': { developer: '11 bit studios', publisher: '11 bit studios', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Frostpunk 2
  'gears-5': { developer: 'The Coalition', publisher: 'Xbox Game Studios', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2019 }, // Gears 5
  'gears-of-war': { developer: 'Epic Games', publisher: 'Microsoft Game Studios', engine: 'Unreal Engine 3', api: null, releaseYear: 2007 }, // Gears of War
  'ghost-of-tsushima': { developer: 'Sucker Punch Productions', publisher: 'Sony Interactive Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2024 }, // Ghost of Tsushima
  'ghostwire-tokyo': { developer: 'Tango Gameworks', publisher: 'Bethesda Softworks', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2022 }, // Ghostwire Tokyo
  'god-of-war': { developer: 'Santa Monica Studio', publisher: 'Sony Interactive Entertainment', engine: null, api: null, releaseYear: 2022 }, // God of War
  'god-of-war-ascension': { developer: null, publisher: 'Sony Computer Entertainment', engine: null, api: null, releaseYear: null }, // God of War Ascension
  'god-of-war-ghost-of-sparta': { developer: 'Ready at Dawn', publisher: 'Sony Computer Entertainment', engine: null, api: null, releaseYear: null }, // God of War Ghost of Sparta
  'god-of-war-ii': { developer: null, publisher: 'Sony Computer Entertainment', engine: null, api: null, releaseYear: null }, // God of War II
  'god-of-war-ragnarok': { developer: 'Santa Monica Studio', publisher: 'Sony Interactive Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2024 }, // God of War - Ragnarok
  'gotham-knights': { developer: 'WB Games Montréal', publisher: 'Warner Bros. Games', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2022 }, // Gotham Knights
  'grand-theft-auto-online': { developer: 'Rockstar North', publisher: 'Rockstar Games', engine: 'RAGE', api: 'DirectX 11', releaseYear: 2015 }, // Grand Theft Auto Online
  'grand-theft-auto-v-enhanced': { developer: 'Rockstar North', publisher: 'Rockstar Games', engine: 'RAGE', api: 'DirectX 12', releaseYear: 2025 }, // Grand Theft Auto V Enhanced
  'grand-theft-auto-vice-city': { developer: 'Rockstar North', publisher: 'Rockstar Games', engine: 'RenderWare', api: null, releaseYear: 2003 }, // Grand Theft Auto Vice City
  'grid-2': { developer: 'Codemasters', publisher: 'Codemasters', engine: 'EGO Engine', api: 'DirectX 11', releaseYear: 2013 }, // Grid 2
  'grid-autosport': { developer: 'Codemasters', publisher: 'Codemasters', engine: 'EGO Engine', api: 'DirectX 11', releaseYear: 2014 }, // GRID Autosport
  'gta-san-andreas': { developer: 'Rockstar North', publisher: 'Rockstar Games', engine: 'RenderWare', api: 'DirectX 9', releaseYear: 2005 }, // GTA San Andreas
  'half-life-alyx': { developer: 'Valve', publisher: 'Valve', engine: 'Source 2', api: 'DirectX 11 / Vulkan', releaseYear: 2020 }, // Half-Life Alyx
  'halo-campaign-evolved': { developer: 'Halo Studios', publisher: 'Xbox Game Studios', engine: 'Unreal Engine 5', api: null, releaseYear: null }, // Halo Campaign Evolved
  'hell-is-us': { developer: 'Rogue Factor', publisher: 'Nacon', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Hell Is Us
  'hellblade-senua-s-sacrifice': { developer: 'Ninja Theory', publisher: 'Ninja Theory', engine: 'Unreal Engine 4', api: 'DirectX 11', releaseYear: 2017 }, // Hellblade - Senua's Sacrifice
  'high-on-life-2': { developer: 'Squanch Games', publisher: 'Squanch Games', engine: null, api: null, releaseYear: null }, // High On Life 2
  'hitman-3': { developer: 'IO Interactive', publisher: 'IO Interactive', engine: 'Glacier', api: 'DirectX 12', releaseYear: 2021 }, // Hitman 3
  'hogwarts-legacy': { developer: 'Avalanche Software', publisher: 'Warner Bros. Games', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2023 }, // Hogwarts Legacy
  'hollow-knight': { developer: 'Team Cherry', publisher: 'Team Cherry', engine: 'Unity', api: 'DirectX 11', releaseYear: 2017 }, // Hollow Knight
  'horizon-forbidden-west': { developer: 'Guerrilla Games', publisher: 'Sony Interactive Entertainment', engine: 'Decima', api: 'DirectX 12', releaseYear: 2024 }, // Horizon Forbidden West
  'horizon-forbidden-west-complete-edition': { developer: 'Guerrilla Games', publisher: 'Sony Interactive Entertainment', engine: 'Decima', api: 'DirectX 12', releaseYear: 2024 }, // Horizon Forbidden West Complete Edition
  'horizon-zero-dawn-remastered': { developer: 'Nixxes Software / Guerrilla Games', publisher: 'Sony Interactive Entertainment', engine: 'Decima', api: 'DirectX 12', releaseYear: 2024 }, // Horizon Zero Dawn Remastered
  'indiana-jones-and-the-great-circle': { developer: 'MachineGames', publisher: 'Bethesda Softworks', engine: 'id Tech 7', api: 'Vulkan', releaseYear: 2024 }, // Indiana Jones and the Great Circle
  'injustice-gods-among-us': { developer: 'NetherRealm Studios', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Unreal Engine 3', api: null, releaseYear: 2013 }, // Injustice Gods Among Us
  'inside': { developer: 'Playdead', publisher: 'Playdead', engine: 'Unity', api: 'DirectX 11', releaseYear: 2016 }, // INSIDE
  'inzoi': { developer: 'inZOI Studio', publisher: 'Krafton', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // inZOI
  'jusant': { developer: 'DON\'T NOD', publisher: 'DON\'T NOD', engine: null, api: null, releaseYear: 2023 }, // Jusant
  'kingdom-come-deliverance': { developer: 'Warhorse Studios', publisher: 'Deep Silver', engine: 'CryEngine', api: 'DirectX 11', releaseYear: 2018 }, // Kingdom Come Deliverance
  'kingdom-come-deliverance-2': { developer: 'Warhorse Studios', publisher: 'Deep Silver', engine: 'CryEngine', api: null, releaseYear: 2025 }, // Kingdom Come Deliverance 2
  'left-4-dead': { developer: 'Valve', publisher: 'Valve', engine: 'Source', api: 'DirectX 9', releaseYear: 2008 }, // Left 4 Dead
  'lego-batman-legacy-of-the-dark-knight': { developer: 'TT Games', publisher: 'Warner Bros. Games', engine: null, api: null, releaseYear: null }, // LEGO Batman Legacy of the Dark Knight
  'lies-of-p': { developer: 'Round8 Studio', publisher: 'Neowiz', engine: 'Unreal Engine 4', api: null, releaseYear: 2023 }, // Lies of P
  'life-is-strange': { developer: 'Dontnod Entertainment', publisher: 'Square Enix', engine: 'Unreal Engine 3', api: null, releaseYear: 2015 }, // Life is Strange
  'life-is-strange-before-the-storm': { developer: 'Deck Nine', publisher: 'Square Enix', engine: 'Unity', api: null, releaseYear: 2017 }, // Life Is Strange Before the Storm
  'little-nightmares-ii': { developer: 'Tarsier Studios', publisher: 'Bandai Namco Entertainment', engine: 'Unreal Engine 4', api: null, releaseYear: 2021 }, // Little Nightmares II
  'little-nightmares-iii': { developer: 'Supermassive Games', publisher: 'Bandai Namco Entertainment', engine: null, api: null, releaseYear: 2025 }, // Little Nightmares III
  'lords-of-the-fallen': { developer: 'Deck13 Interactive', publisher: 'CI Games', engine: null, api: 'DirectX 11', releaseYear: 2014 }, // Lords of the Fallen
  'lords-of-the-fallen-2023': { developer: 'Hexworks', publisher: 'CI Games', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2023 }, // Lords of the Fallen 2023
  'mad-max': { developer: 'Avalanche Studios', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Apex Engine', api: 'DirectX 11', releaseYear: 2015 }, // Mad Max
  'mafia-definitive-edition': { developer: 'Hangar 13', publisher: '2K Games', engine: 'Illusion Engine', api: null, releaseYear: 2020 }, // Mafia Definitive Edition
  'mafia-ii': { developer: '2K Czech', publisher: '2K Games', engine: 'Illusion Engine', api: null, releaseYear: 2010 }, // Mafia II
  'mafia-iii': { developer: 'Hangar 13', publisher: '2K Games', engine: 'Illusion Engine', api: 'DirectX 11', releaseYear: 2016 }, // Mafia III
  'manor-lords': { developer: 'Slavic Magic', publisher: 'Hooded Horse', engine: 'Unreal Engine 5', api: null, releaseYear: 2024 }, // Manor lords
  'marvels-guardians-of-the-galaxy': { developer: 'Eidos-Montréal', publisher: 'Square Enix', engine: null, api: 'DirectX 12', releaseYear: 2021 }, // Marvels Guardians of the Galaxy
  'marvels-spiderman-2': { developer: 'Insomniac Games', publisher: 'Sony Interactive Entertainment', engine: 'Insomniac Engine', api: 'DirectX 12', releaseYear: 2025 }, // Marvels SpiderMan 2
  'marvels-spiderman-miles-morales': { developer: 'Insomniac Games', publisher: 'Sony Interactive Entertainment', engine: 'Insomniac Engine', api: 'DirectX 12', releaseYear: 2022 }, // Marvels SpiderMan Miles Morales
  'marvels-spiderman-remastered': { developer: 'Insomniac Games', publisher: 'Sony Interactive Entertainment', engine: 'Insomniac Engine', api: 'DirectX 12', releaseYear: 2022 }, // Marvels SpiderMan Remastered
  'mass-effect-legendary-edition': { developer: 'BioWare', publisher: 'Electronic Arts', engine: 'Unreal Engine 3', api: 'DirectX 11', releaseYear: 2021 }, // Mass Effect Legendary Edition
  'max-payne-2': { developer: 'Remedy Entertainment', publisher: 'Rockstar Games', engine: 'MAX-FX', api: null, releaseYear: 2003 }, // Max Payne 2
  'max-payne-3': { developer: 'Rockstar Studios', publisher: 'Rockstar Games', engine: 'RAGE', api: null, releaseYear: 2012 }, // Max Payne 3
  'metal-gear-solid-2-sons-of-liberty': { developer: 'Konami', publisher: 'Konami', engine: null, api: null, releaseYear: null }, // Metal Gear Solid 2 Sons of Liberty
  'metal-gear-solid-3-snake-eater': { developer: 'Konami', publisher: 'Konami', engine: null, api: null, releaseYear: 2023 }, // Metal Gear Solid 3 Snake Eater
  'metal-gear-solid-master-collection-version': { developer: 'Konami', publisher: 'Konami', engine: null, api: null, releaseYear: 2023 }, // Metal Gear Solid - Master Collection Version
  'metal-gear-solid-snake-eater-2025': { developer: 'Konami', publisher: 'Konami', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Metal Gear Solid Snake Eater 2025
  'metal-gear-solid-v-ground-zeroes': { developer: 'Kojima Productions', publisher: 'Konami', engine: 'Fox Engine', api: 'DirectX 11', releaseYear: 2014 }, // Metal Gear Solid V Ground Zeroes
  'metal-gear-solid-v-the-phantom-pain': { developer: 'Kojima Productions', publisher: 'Konami', engine: 'Fox Engine', api: 'DirectX 11', releaseYear: 2015 }, // Metal Gear Solid V - The Phantom Pain
  'metro-exodus': { developer: '4A Games', publisher: 'Deep Silver', engine: '4A Engine', api: 'DirectX 11 / DirectX 12', releaseYear: 2019 }, // Metro Exodus
  'metro-exodus-enhanced-edition': { developer: '4A Games', publisher: 'Deep Silver', engine: '4A Engine', api: 'DirectX 12', releaseYear: 2021 }, // Metro Exodus Enhanced Edition
  'metro-last-light': { developer: '4A Games', publisher: 'Deep Silver', engine: '4A Engine', api: 'DirectX 11', releaseYear: 2013 }, // Metro Last Light
  'microsoft-flight-simulator': { developer: 'Asobo Studio', publisher: 'Xbox Game Studios', engine: null, api: 'DirectX 11 / DirectX 12', releaseYear: 2020 }, // Microsoft Flight Simulator
  'middle-earth-shadow-of-mordor': { developer: 'Monolith Productions', publisher: 'Warner Bros. Interactive Entertainment', engine: 'LithTech', api: 'DirectX 11', releaseYear: 2014 }, // Middle-earth Shadow of Mordor
  'middle-earth-shadow-of-war': { developer: 'Monolith Productions', publisher: 'Warner Bros. Interactive Entertainment', engine: 'LithTech', api: 'DirectX 11', releaseYear: 2017 }, // Middle-earth Shadow of War
  'mindseye': { developer: 'Build A Rocket Boy', publisher: 'IO Interactive', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // MindsEye
  'minecraft': { developer: 'Mojang Studios', publisher: 'Mojang Studios', engine: null, api: 'OpenGL', releaseYear: 2011 }, // Minecraft
  'mortal-kombat': { developer: 'NetherRealm Studios', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Unreal Engine 3', api: 'DirectX 9', releaseYear: 2013 }, // Mortal Kombat
  'mortal-kombat-1': { developer: 'NetherRealm Studios', publisher: 'Warner Bros. Games', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2023 }, // Mortal Kombat 1
  'mortal-kombat-11': { developer: 'NetherRealm Studios', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Unreal Engine 3', api: 'DirectX 11', releaseYear: 2019 }, // Mortal Kombat 11
  'mortal-kombat-xl': { developer: 'NetherRealm Studios', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Unreal Engine 3', api: 'DirectX 11', releaseYear: 2016 }, // Mortal Kombat XL
  'mx-vs-atv-legends': { developer: 'Rainbow Studios', publisher: 'THQ Nordic', engine: null, api: null, releaseYear: 2022 }, // MX vs ATV Legends
  'need-for-speed-heat': { developer: 'Ghost Games', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11', releaseYear: 2019 }, // Need for Speed Heat
  'need-for-speed-hot-pursuit': { developer: 'Criterion Games', publisher: 'Electronic Arts', engine: 'Chameleon', api: null, releaseYear: 2010 }, // Need for Speed Hot Pursuit
  'need-for-speed-most-wanted': { developer: null, publisher: 'Electronic Arts', engine: null, api: null, releaseYear: null }, // Need for Speed Most Wanted
  'need-for-speed-payback': { developer: 'Ghost Games', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11', releaseYear: 2017 }, // Need for Speed - Payback
  'need-for-speed-rivals': { developer: 'Ghost Games', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11', releaseYear: 2013 }, // Need for Speed Rivals
  'need-for-speed-shift': { developer: 'Slightly Mad Studios', publisher: 'Electronic Arts', engine: null, api: null, releaseYear: 2009 }, // Need for Speed Shift
  'need-for-speed-the-run': { developer: 'EA Black Box', publisher: 'Electronic Arts', engine: 'Frostbite 2', api: null, releaseYear: 2011 }, // Need for Speed The Run
  'ninja-gaiden-4': { developer: null, publisher: 'Koei Tecmo / Xbox Game Studios', engine: 'Unreal Engine 5', api: null, releaseYear: 2025 }, // Ninja Gaiden 4
  'nioh-3': { developer: 'Team Ninja', publisher: 'Koei Tecmo', engine: null, api: null, releaseYear: null }, // Nioh 3
  'no-man-s-sky': { developer: 'Hello Games', publisher: 'Hello Games', engine: null, api: 'Vulkan', releaseYear: 2016 }, // No Man's Sky
  'ori-and-the-blind-forest': { developer: 'Moon Studios', publisher: 'Microsoft Studios', engine: 'Unity', api: null, releaseYear: 2015 }, // Ori and the Blind Forest
  'outlast': { developer: 'Red Barrels', publisher: 'Red Barrels', engine: 'Unreal Engine 3', api: null, releaseYear: 2013 }, // Outlast
  'pacific-drive': { developer: 'Ironwood Studios', publisher: 'Kepler Interactive', engine: null, api: null, releaseYear: 2024 }, // Pacific Drive
  'payday-3': { developer: 'Starbreeze Studios', publisher: 'Deep Silver', engine: 'Unreal Engine 4', api: null, releaseYear: 2023 }, // Payday 3
  'plants-vs-zombies-garden-warfare-2': { developer: 'PopCap Games', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11', releaseYear: 2016 }, // Plants vs. Zombies Garden Warfare 2
  'prey': { developer: 'Arkane Studios', publisher: 'Bethesda Softworks', engine: 'CryEngine', api: 'DirectX 11', releaseYear: 2017 }, // Prey
  'prince-of-persia': { developer: null, publisher: 'Ubisoft', engine: null, api: null, releaseYear: null }, // Prince of Persia
  'project-cars-3': { developer: 'Slightly Mad Studios', publisher: 'Bandai Namco Entertainment', engine: 'Madness Engine', api: 'DirectX 11', releaseYear: 2020 }, // Project CARS 3
  'prototype': { developer: 'Radical Entertainment', publisher: 'Activision', engine: null, api: 'DirectX 9', releaseYear: 2009 }, // Prototype
  'prototype-2': { developer: 'Radical Entertainment', publisher: 'Activision', engine: null, api: null, releaseYear: 2012 }, // Prototype 2
  'pubg-battlegrounds': { developer: 'PUBG Studios', publisher: 'KRAFTON', engine: 'Unreal Engine 4', api: 'DirectX 11 / DirectX 12', releaseYear: 2017 }, // PUBG Battlegrounds
  'quantum-break': { developer: 'Remedy Entertainment', publisher: 'Microsoft Studios', engine: 'Northlight Engine', api: 'DirectX 11 / DirectX 12', releaseYear: 2016 }, // Quantum Break
  'rage-2': { developer: null, publisher: 'Bethesda Softworks', engine: 'Apex Engine', api: 'Vulkan', releaseYear: 2019 }, // Rage 2
  'ready-or-not': { developer: 'VOID Interactive', publisher: 'VOID Interactive', engine: 'Unreal Engine', api: null, releaseYear: 2023 }, // Ready Or Not
  'recore': { developer: null, publisher: 'Microsoft Studios', engine: null, api: null, releaseYear: 2016 }, // ReCore
  'red-dead-redemption': { developer: 'Rockstar San Diego', publisher: 'Rockstar Games', engine: 'RAGE', api: null, releaseYear: 2024 }, // Red Dead Redemption
  'red-dead-redemption-2': { developer: 'Rockstar Games', publisher: 'Rockstar Games', engine: 'RAGE', api: 'DirectX 12 / Vulkan', releaseYear: 2019 }, // Red Dead Redemption 2
  'resident-evil-2': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 11 / DirectX 12', releaseYear: 2019 }, // Resident Evil 2
  'resident-evil-3': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 12', releaseYear: 2020 }, // Resident Evil 3
  'resident-evil-4-remake': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 12', releaseYear: 2023 }, // Resident Evil 4 Remake
  'resident-evil-7-biohazard': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 11 / DirectX 12', releaseYear: 2017 }, // Resident Evil 7 Biohazard
  'resident-evil-requiem': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: null, releaseYear: 2026 }, // Resident Evil Requiem
  'resident-evil-village': { developer: 'Capcom', publisher: 'Capcom', engine: 'RE Engine', api: 'DirectX 12', releaseYear: 2021 }, // Resident Evil Village
  'returnal': { developer: 'Housemarque', publisher: 'Sony Interactive Entertainment', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2023 }, // Returnal
  'ride-6': { developer: 'Milestone', publisher: 'Milestone', engine: null, api: null, releaseYear: null }, // Ride 6
  'rise-of-the-tomb-raider': { developer: 'Crystal Dynamics', publisher: 'Square Enix', engine: 'Foundation Engine', api: 'DirectX 11 / DirectX 12', releaseYear: 2016 }, // Rise of the Tomb Raider
  'rocket-league': { developer: 'Psyonix', publisher: 'Psyonix', engine: 'Unreal Engine 3', api: null, releaseYear: 2015 }, // Rocket League
  'rust': { developer: 'Facepunch Studios', publisher: 'Facepunch Studios', engine: 'Unity', api: 'DirectX 11', releaseYear: 2018 }, // Rust
  'saints-row': { developer: 'Volition', publisher: 'Deep Silver', engine: null, api: 'DirectX 12', releaseYear: 2022 }, // Saints Row
  'samson': { developer: null, publisher: null, engine: null, api: null, releaseYear: null }, // Samson
  'sekiro': { developer: 'FromSoftware', publisher: 'Activision', engine: null, api: 'DirectX 11', releaseYear: 2019 }, // Sekiro
  'senua-s-saga-hellblade-ii': { developer: 'Ninja Theory', publisher: 'Xbox Game Studios', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Senua's Saga Hellblade II
  'shadow-of-the-tomb-raider-definitive-edition': { developer: 'Eidos-Montréal', publisher: 'Square Enix', engine: null, api: 'DirectX 11 / DirectX 12', releaseYear: 2019 }, // Shadow of the Tomb Raider Definitive Edition
  'shadow-of-war': { developer: 'Monolith Productions', publisher: 'Warner Bros. Interactive Entertainment', engine: null, api: 'DirectX 11', releaseYear: 2017 }, // Shadow of War
  'shift-2-unleashed': { developer: 'Slightly Mad Studios', publisher: 'Electronic Arts', engine: null, api: null, releaseYear: 2011 }, // Shift 2 Unleashed
  'silent-hill-2': { developer: 'Bloober Team', publisher: 'Konami', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Silent Hill 2
  'silent-hill-f': { developer: 'NeoBards Entertainment', publisher: 'Konami', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Silent Hill f
  'sniper-elite-4': { developer: 'Rebellion Developments', publisher: 'Rebellion Developments', engine: 'Asura', api: 'DirectX 11 / DirectX 12', releaseYear: 2017 }, // Sniper Elite 4
  'sniper-elite-iii': { developer: 'Rebellion Developments', publisher: null, engine: 'Asura', api: 'DirectX 11', releaseYear: 2014 }, // Sniper Elite III
  'sniper-elite-nazi-zombie-army-2': { developer: 'Rebellion Developments', publisher: 'Rebellion Developments', engine: 'Asura', api: null, releaseYear: 2013 }, // Sniper Elite Nazi Zombie Army 2
  'sniper-ghost-warrior-contracts': { developer: 'CI Games', publisher: 'CI Games', engine: 'CryEngine', api: 'DirectX 11', releaseYear: 2019 }, // Sniper Ghost Warrior Contracts
  'somerville': { developer: 'Jumpship', publisher: null, engine: null, api: null, releaseYear: 2022 }, // Somerville
  'sony-uncharted-legacy-of-thieves-collection': { developer: 'Naughty Dog', publisher: 'Sony Interactive Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2022 }, // Sony Uncharted Legacy of Thieves Collection
  'spec-ops-the-line': { developer: 'Yager Development', publisher: '2K Games', engine: 'Unreal Engine 3', api: 'DirectX 9', releaseYear: 2012 }, // Spec Ops The Line
  'spider-man-miles-morales': { developer: 'Insomniac Games', publisher: 'Sony Interactive Entertainment', engine: 'Insomniac Engine', api: 'DirectX 12', releaseYear: 2022 }, // Spider Man Miles Morales
  'spider-man-remastered': { developer: 'Insomniac Games', publisher: 'Sony Interactive Entertainment', engine: 'Insomniac Engine', api: 'DirectX 12', releaseYear: 2022 }, // Spider-Man Remastered
  'stalker-2-heart-of-chornobyl': { developer: 'GSC Game World', publisher: 'GSC Game World', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // STALKER 2 Heart of Chornobyl
  'star-wars-jedi-survivor': { developer: 'Respawn Entertainment', publisher: 'Electronic Arts', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2023 }, // STAR WARS Jedi Survivor
  'star-wars-outlaws': { developer: 'Massive Entertainment', publisher: 'Ubisoft', engine: 'Snowdrop', api: 'DirectX 12', releaseYear: 2024 }, // Star Wars Outlaws
  'starfield': { developer: 'Bethesda Game Studios', publisher: 'Bethesda Softworks', engine: 'Creation Engine 2', api: 'DirectX 12', releaseYear: 2023 }, // Starfield
  'stellar-blade': { developer: 'Shift Up', publisher: 'Sony Interactive Entertainment', engine: 'Unreal Engine 4', api: 'DirectX 12', releaseYear: 2025 }, // Stellar Blade
  'stray': { developer: 'BlueTwelve Studio', publisher: 'Annapurna Interactive', engine: 'Unreal Engine 4', api: null, releaseYear: 2022 }, // Stray
  'tekken-8': { developer: 'Bandai Namco Studios', publisher: 'Bandai Namco Entertainment', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Tekken 8
  'the-alters': { developer: '11 bit studios', publisher: '11 bit studios', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // The Alters
  'the-crew-2': { developer: 'Ivory Tower', publisher: 'Ubisoft', engine: null, api: 'DirectX 11', releaseYear: 2018 }, // The Crew 2
  'the-crew-motorfest': { developer: 'Ivory Tower', publisher: 'Ubisoft', engine: null, api: null, releaseYear: 2023 }, // The Crew Motorfest
  'the-dark-pictures-anthology-the-devil-in-me': { developer: 'Supermassive Games', publisher: 'Bandai Namco Entertainment', engine: 'Unreal Engine 4', api: null, releaseYear: 2022 }, // The Dark Pictures Anthology The Devil in Me
  'the-elder-scrolls-v-skyrim': { developer: 'Bethesda Game Studios', publisher: 'Bethesda Softworks', engine: 'Creation Engine', api: 'DirectX 9', releaseYear: 2011 }, // The Elder Scrolls V Skyrim
  'the-last-of-us': { developer: 'Naughty Dog', publisher: 'Sony Interactive Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2023 }, // The Last of Us
  'the-last-of-us-part-ii': { developer: 'Naughty Dog', publisher: 'Sony Interactive Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2025 }, // The Last of Us Part II
  'the-matrix-awakens': { developer: 'Epic Games', publisher: 'Epic Games', engine: 'Unreal Engine 5', api: null, releaseYear: null }, // The Matrix Awakens
  'the-sims-3': { developer: null, publisher: 'Electronic Arts', engine: null, api: 'DirectX 9', releaseYear: 2009 }, // The Sims 3
  'the-sims-4': { developer: 'Maxis', publisher: 'Electronic Arts', engine: null, api: null, releaseYear: 2014 }, // The Sims 4
  'the-witcher': { developer: 'CD Projekt Red', publisher: null, engine: 'Aurora Engine', api: 'DirectX 9', releaseYear: 2007 }, // The Witcher
  'the-witcher-2-assassins-of-kings': { developer: 'CD Projekt Red', publisher: 'CD Projekt', engine: 'REDengine', api: 'DirectX 9', releaseYear: 2011 }, // The Witcher 2 Assassins of Kings
  'the-witcher-3-wild-hunt': { developer: 'CD Projekt Red', publisher: 'CD Projekt', engine: 'REDengine 3', api: 'DirectX 11 / DirectX 12', releaseYear: 2015 }, // The Witcher 3 Wild Hunt
  'thief-definitive-edition': { developer: 'Eidos-Montréal', publisher: 'Square Enix', engine: 'Unreal Engine 3', api: 'DirectX 11', releaseYear: 2014 }, // THIEF - Definitive Edition
  'titanfall-2': { developer: 'Respawn Entertainment', publisher: 'Electronic Arts', engine: null, api: 'DirectX 11', releaseYear: 2016 }, // Titanfall 2
  'tom-clancy-s-ghost-recon': { developer: 'Red Storm Entertainment', publisher: 'Ubisoft', engine: null, api: null, releaseYear: 2001 }, // Tom Clancy's Ghost Recon
  'tom-clancy-s-ghost-recon-breakpoint': { developer: 'Ubisoft Paris', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: null, releaseYear: 2019 }, // Tom Clancy's Ghost Recon Breakpoint
  'tom-clancy-s-ghost-recon-future-soldier': { developer: 'Ubisoft Paris', publisher: 'Ubisoft', engine: null, api: 'DirectX 11', releaseYear: 2012 }, // Tom Clancy's Ghost Recon Future Soldier
  'tom-clancy-s-ghost-recon-wildlands': { developer: 'Ubisoft Paris', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11', releaseYear: 2017 }, // Tom Clancy's Ghost Recon Wildlands
  'tom-clancy-s-rainbow-six-extraction': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: null, releaseYear: 2022 }, // Tom Clancy's Rainbow Six Extraction
  'tom-clancy-s-rainbow-six-siege': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'AnvilNext 2.0', api: 'DirectX 11 / Vulkan', releaseYear: 2015 }, // Tom Clancy's Rainbow Six Siege
  'tom-clancy-s-splinter-cell': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Unreal Engine 2', api: null, releaseYear: 2003 }, // Tom Clancy's Splinter Cell
  'tom-clancy-s-splinter-cell-blacklist': { developer: 'Ubisoft Toronto', publisher: 'Ubisoft', engine: 'Unreal Engine 2.5', api: 'DirectX 11', releaseYear: 2013 }, // Tom Clancy's Splinter Cell Blacklist
  'tom-clancy-s-splinter-cell-conviction': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Unreal Engine 2.5', api: null, releaseYear: 2010 }, // Tom Clancy's Splinter Cell Conviction
  'tom-clancy-s-the-division-2': { developer: 'Massive Entertainment', publisher: 'Ubisoft', engine: 'Snowdrop', api: 'DirectX 11 / DirectX 12', releaseYear: 2019 }, // Tom Clancy's The Division 2
  'tomb-raider-goty-edition': { developer: 'Crystal Dynamics', publisher: 'Square Enix', engine: 'Crystal Engine', api: 'DirectX 11', releaseYear: 2013 }, // Tomb Raider GOTY Edition
  'total-war-warhammer-iii': { developer: 'Creative Assembly', publisher: 'Sega', engine: null, api: 'DirectX 11 / DirectX 12', releaseYear: 2022 }, // Total War WARHAMMER III
  'trek-to-yomi': { developer: 'Flying Wild Hog', publisher: 'Devolver Digital', engine: 'Unreal Engine 4', api: null, releaseYear: 2022 }, // Trek to Yomi
  'uncharted': { developer: null, publisher: null, engine: null, api: null, releaseYear: null }, // Uncharted
  'uncharted-legacy-of-thieves': { developer: 'Naughty Dog', publisher: 'Sony Interactive Entertainment', engine: null, api: 'DirectX 12', releaseYear: 2022 }, // UNCHARTED Legacy of Thieves
  'unravel-two': { developer: 'Coldwood Interactive', publisher: 'Electronic Arts', engine: null, api: null, releaseYear: 2018 }, // Unravel Two
  'until-dawn': { developer: 'Ballistic Moon', publisher: 'Sony Interactive Entertainment', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2024 }, // Until Dawn
  'wanted-weapons-of-fate': { developer: 'GRIN', publisher: 'Warner Bros. Interactive Entertainment', engine: 'Diesel', api: null, releaseYear: 2009 }, // Wanted Weapons of Fate
  'war-thunder': { developer: 'Gaijin Entertainment', publisher: 'Gaijin Entertainment', engine: 'Dagor Engine', api: 'DirectX 11 / Vulkan', releaseYear: 2013 }, // War Thunder
  'warhammer-40000-space-marine-2': { developer: 'Saber Interactive', publisher: 'Focus Entertainment', engine: 'Swarm Engine', api: 'DirectX 12', releaseYear: 2024 }, // Warhammer 40000 Space Marine 2
  'watch-dogs': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Disrupt', api: 'DirectX 11', releaseYear: 2014 }, // Watch Dogs
  'watch-dogs-2': { developer: 'Ubisoft Montreal', publisher: 'Ubisoft', engine: 'Disrupt', api: 'DirectX 11', releaseYear: 2016 }, // Watch Dogs 2
  'watch-dogs-legion': { developer: 'Ubisoft Toronto', publisher: 'Ubisoft', engine: 'Disrupt', api: 'DirectX 11 / DirectX 12', releaseYear: 2020 }, // Watch Dogs Legion
  'wo-long-fallen-dynasty': { developer: 'Team Ninja', publisher: 'Koei Tecmo', engine: null, api: 'DirectX 12', releaseYear: 2023 }, // Wo Long Fallen Dynasty
  'wolfenstein-ii': { developer: 'MachineGames', publisher: 'Bethesda Softworks', engine: 'id Tech 6', api: 'Vulkan', releaseYear: 2017 }, // Wolfenstein II
  'wolfenstein-the-new-order': { developer: 'MachineGames', publisher: 'Bethesda Softworks', engine: 'id Tech 5', api: 'OpenGL', releaseYear: 2014 }, // Wolfenstein The New Order
  'wrc-8-fia-world-rally-championship': { developer: null, publisher: 'Bigben Interactive', engine: null, api: null, releaseYear: 2019 }, // WRC 8 FIA World Rally Championship
  'wuchang-fallen-feathers': { developer: null, publisher: '505 Games', engine: 'Unreal Engine 5', api: 'DirectX 12', releaseYear: 2025 }, // Wuchang Fallen Feathers
  'wwe-2k23': { developer: 'Visual Concepts', publisher: null, engine: null, api: null, releaseYear: 2023 }, // WWE 2K23
};
