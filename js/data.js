/* ASHFALL — data.js
 * Every static definition in the game: terrain, seasons, factions, units,
 * buildings, technologies, the narrative event deck, difficulty, balance.
 * Pure data (plus small predicate functions on events). No DOM, no state.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.data = (function () {

  /* ------------------------------------------------------------------ *
   * TERRAIN
   * move: movement cost (0 = impassable). def: defender multiplier.
   * yields: what one hex contributes to an adjacent settlement, per turn.
   * ------------------------------------------------------------------ */
  var TERRAIN = {
    ash: {
      name: "Ash Plains", move: 1, def: 1.0, habitable: true,
      yields: { food: 1.0, scrap: 0.5 },
      blurb: "Grey miles where topsoil used to be. Hardy grass comes up the colour of old teeth, but it comes up."
    },
    pine: {
      name: "Pine Barrens", move: 1, def: 1.2, habitable: true,
      yields: { food: 1.5, scrap: 0.5 },
      blurb: "The forests that came back wrong: black needles, sweet sap, game with too many eyes. Still — wood, meat, cover."
    },
    ruin: {
      name: "Ruins", move: 2, def: 1.3, habitable: true,
      yields: { scrap: 2.0, know: 0.5 },
      blurb: "A dead city's ribcage. Every girder is a fortune in scrap and every cellar is somebody's tomb."
    },
    fen: {
      name: "Blightfens", move: 2, def: 1.1, habitable: true,
      yields: { food: 1.5, meds: 0.3 },
      blurb: "Drowned land, oil-sheened and fever-warm. Things grow here that grow nowhere else. Some are even food."
    },
    crag: {
      name: "Crags", move: 2, def: 1.5, habitable: true,
      yields: { scrap: 1.0, fuel: 0.5 },
      blurb: "Broken highlands, riddled with old mineshafts and older bones. Easy to hold, hard to farm."
    },
    glass: {
      name: "Glasslands", move: 2, def: 1.1, habitable: false, rad: true,
      yields: { know: 1.0 },
      blurb: "Where the bombs kissed the earth, the sand turned to glass. It glows on moonless nights. Nothing should go there. Things do."
    },
    seabed: {
      name: "Dead Sea", move: 2, def: 0.9, habitable: false,
      yields: { scrap: 0.5 },
      blurb: "An ocean's empty bed, salt-white and ship-littered. The horizon shimmers with heat and lies."
    },
    water: {
      name: "Black Water", move: 0, def: 1.0, habitable: false,
      yields: {},
      blurb: "What rain is left collects here, dark as engine oil. Fish live in it. Define 'fish'."
    }
  };
  var TERRAIN_KEYS = ["ash", "pine", "ruin", "fen", "crag", "glass", "seabed", "water"];

  /* ------------------------------------------------------------------ *
   * SITES — special fixtures on tiles
   * ------------------------------------------------------------------ */
  var SITES = {
    vault: {
      name: "Sealed Vault", once: true, salvage: { scrap: 25, know: 10 },
      blurb: "A pre-Fall shelter, door intact. Whatever's inside has been waiting eighty years to be useful or fatal."
    },
    cache: {
      name: "Supply Cache", once: true, salvage: { scrap: 9, meds: 2 },
      blurb: "Somebody buried this and never came back. Their loss is the literal definition of your gain."
    },
    reactor: {
      name: "Old Reactor", perTurn: { fuel: 2 },
      blurb: "A power plant's carcass, still warm in its bones. Tap it and it gives. Mistreat it and it remembers how to burn."
    },
    beacon: {
      name: "The Beacon", beacon: true,
      blurb: "A kilometre of dead antenna stabbing the sky. Before the Fall it spoke to the whole world. It could again."
    }
  };

  /* ------------------------------------------------------------------ *
   * SEASONS — one turn = one season
   * ------------------------------------------------------------------ */
  var SEASONS = [
    { key: "thaw", name: "Thaw", foodMult: 1.0, stormChance: 0.20,
      banner: "The ice lets go of the land, grudgingly." },
    { key: "glare", name: "Glare", foodMult: 1.1, stormChance: 0.35,
      banner: "The sun comes down like a verdict. Ash storms walk the horizon." },
    { key: "rust", name: "Rust", foodMult: 1.0, stormChance: 0.25,
      banner: "Harvest, such as it is. Everything metal weeps orange." },
    { key: "dark", name: "Long Dark", foodMult: 0.55, stormChance: 0.30,
      banner: "The Long Dark. Count your stores, count your people, hope both numbers hold." }
  ];

  /* ------------------------------------------------------------------ *
   * FACTIONS
   * mods multiply faction-wide yields/combat. culture keys into names.js.
   * ------------------------------------------------------------------ */
  var FACTIONS = [
    {
      key: "hearth", name: "The Hearthbound", noun: "Hearthbound",
      color: "#d9913c", culture: "hearth", personality: "builder",
      title: "Warden", settlementNoun: "stead",
      blurb: "Farmers with rifles. They believe the world can be coaxed into feeding people again, and they are stubborn enough to be right.",
      doctrine: "Strength: fields and patience. +25% food, sturdier defence, hope mends faster. Weakness: slow to anger, slow to march.",
      mods: { food: 1.25, def: 1.1, hopeRegen: 1 },
      startUnits: ["militia", "militia", "scav"],
      aiAggro: 0.15, aiExpand: 0.8,
      aiTech: ["seedvaults", "cleanwater", "tools", "fieldmed", "signal", "powder", "combustion", "crypto", "innoculants", "arcforge", "antenna"]
    },
    {
      key: "legion", name: "The Rust Legion", noun: "Legion",
      color: "#c0392b", culture: "legion", personality: "warlord",
      title: "Warlord", settlementNoun: "garrison",
      blurb: "An army that outlived its war and went looking for another. They tithe the weak and call it protection. Sometimes it even is.",
      doctrine: "Strength: iron and appetite. +25% attack, +15% scrap. Weakness: hungry, hated, and aware of neither.",
      mods: { atk: 1.25, scrap: 1.15 },
      startUnits: ["militia", "raider", "scav"],
      aiAggro: 0.85, aiExpand: 0.5,
      aiTech: ["tools", "powder", "combustion", "seedvaults", "signal", "arcforge", "cleanwater", "fieldmed", "crypto", "innoculants", "antenna"]
    },
    {
      key: "choir", name: "The Veiled Choir", noun: "Choir",
      color: "#9fd356", culture: "choir", personality: "zealot",
      title: "First Voice", settlementNoun: "sanctum",
      blurb: "They sing to the Glow and swear it sings back. Pilgrims walk out of the glasslands with burns like script and smiles you cannot argue with.",
      doctrine: "Strength: faith. Hope never breaks while the sanctum stands; radiation does half work on them. Weakness: everyone else.",
      mods: { know: 1.1, radResist: 0.5, hopeFloor: 15 },
      startUnits: ["militia", "militia", "scav"],
      aiAggro: 0.55, aiExpand: 0.6,
      aiTech: ["signal", "innoculants", "cleanwater", "crypto", "seedvaults", "tools", "fieldmed", "powder", "combustion", "arcforge", "antenna"]
    },
    {
      key: "caravan", name: "The Free Caravans", noun: "Caravaners",
      color: "#3da8a8", culture: "caravan", personality: "trader",
      title: "Route-Mistress", settlementNoun: "depot",
      blurb: "Rolling cities of welded trucks and counted favours. They own no land and tax every road, which is better.",
      doctrine: "Strength: wheels and ledgers. +25% scrap and fuel, the best market rates. Weakness: everything they love can be stolen.",
      mods: { scrap: 1.25, fuel: 1.25, trade: true },
      startUnits: ["scav", "scav", "militia"],
      aiAggro: 0.25, aiExpand: 0.7,
      aiTech: ["combustion", "tools", "signal", "seedvaults", "crypto", "cleanwater", "powder", "fieldmed", "arcforge", "innoculants", "antenna"]
    },
    {
      key: "archive", name: "The Archivists", noun: "Archivists",
      color: "#7d8fd0", culture: "archive", personality: "hermit",
      title: "Lexarch", settlementNoun: "stack",
      blurb: "Monks of the magnetic tape. They burned villages' worth of effort saving books nobody alive can read — yet. That 'yet' is their whole religion.",
      doctrine: "Strength: memory. +50% knowledge, walls of conviction (+15% defence). Weakness: an army of librarians is an army of librarians.",
      mods: { know: 1.5, def: 1.15 },
      startUnits: ["militia", "scav"],
      startRes: { know: 8 },
      aiAggro: 0.05, aiExpand: 0.45,
      aiTech: ["signal", "crypto", "cleanwater", "seedvaults", "tools", "fieldmed", "antenna", "powder", "innoculants", "combustion", "arcforge"]
    },
    {
      key: "feral", name: "The Court of Teeth", noun: "Court",
      color: "#cdbfa3", culture: "feral", personality: "raider",
      title: "Alpha", settlementNoun: "warren",
      blurb: "The wastes' own children — changed, quick, and done apologising for it. They den in places that kill ordinary people and breed like a grudge.",
      doctrine: "Strength: the Glow ignores them; broods grow fast; +10% attack. Weakness: scrap-poor, trusted by no one, including each other.",
      mods: { atk: 1.1, radImmune: true, growth: 1.5, scrap: 0.85 },
      startUnits: ["raider", "raider", "scav"],
      aiAggro: 0.75, aiExpand: 0.65,
      aiTech: ["innoculants", "seedvaults", "tools", "powder", "cleanwater", "combustion", "signal", "fieldmed", "crypto", "arcforge", "antenna"]
    }
  ];

  /* ------------------------------------------------------------------ *
   * UNITS
   * ------------------------------------------------------------------ */
  var UNITS = {
    scav: {
      name: "Scavengers", glyph: "s",
      cost: { scrap: 5 }, popCost: 1, upkeep: { scrap: 0.2 },
      atk: 2, def: 2, move: 3, vision: 3,
      can: { salvage: true },
      blurb: "Lean folk with crowbars and a sense for which floors hold. They find things. Occasionally they find trouble first."
    },
    militia: {
      name: "Militia", glyph: "m",
      cost: { scrap: 7 }, popCost: 1, upkeep: { scrap: 0.3 },
      atk: 3, def: 5, move: 2, vision: 2,
      blurb: "Your neighbours, with pikes and pipe-guns and everything to lose. They hold ground because the ground is theirs."
    },
    raider: {
      name: "Raiders", glyph: "r",
      cost: { scrap: 9, fuel: 1 }, popCost: 1, upkeep: { scrap: 0.3, fuel: 0.2 },
      atk: 6, def: 3, move: 3, vision: 2,
      can: { pillage: true },
      blurb: "Fast, loud, and allergic to fair fights. They arrive with engines screaming and leave with everything that isn't bolted down."
    },
    veteran: {
      name: "Veterans", glyph: "V",
      cost: { scrap: 13, fuel: 2 }, popCost: 1, upkeep: { scrap: 0.5, fuel: 0.2 },
      atk: 7, def: 7, move: 2, vision: 2,
      needsBuilding: "barracks",
      blurb: "Survivors of enough battles to stop counting. Plate armour hammered from car doors; eyes like the Long Dark."
    },
    reclaimer: {
      name: "Reclaimer Crew", glyph: "c",
      cost: { scrap: 12 }, popCost: 3, upkeep: { scrap: 0.2 },
      atk: 1, def: 2, move: 2, vision: 2,
      can: { found: true },
      blurb: "Families, seed-stock, a disassembled windmill, and a map with one hopeful circle on it. Guard them well."
    }
  };

  /* ------------------------------------------------------------------ *
   * BUILDINGS — per settlement, max one of each
   * ------------------------------------------------------------------ */
  var BUILDINGS = {
    hydrofarm: {
      name: "Hydrofarm", cost: { scrap: 12 }, turns: 2,
      effectDesc: "+3 food",
      blurb: "Gut-flora vats and gravel beds under salvaged glass. The tomatoes taste like pennies. Nobody complains."
    },
    scrapforge: {
      name: "Scrapforge", cost: { scrap: 12 }, turns: 2,
      effectDesc: "+2.5 scrap",
      blurb: "Where the old world is fed to the fire and comes out useful. The anvil chorus runs all night."
    },
    still: {
      name: "Fuel Still", cost: { scrap: 10 }, turns: 2,
      effectDesc: "+1.5 fuel",
      blurb: "Coils, drums, and a smell that peels paint. It turns rot into motion."
    },
    clinic: {
      name: "Clinic", cost: { scrap: 14 }, turns: 2,
      effectDesc: "+1 meds; your warbands mend faster on home soil",
      blurb: "Boiled instruments, honest lamplight, a door that never locks. The closest thing the wastes have to mercy."
    },
    archive: {
      name: "Archive", cost: { scrap: 16 }, turns: 3,
      effectDesc: "+2 knowledge",
      blurb: "Shelves of the dead world's mind: manuals, maps, a children's encyclopedia worth more than gold."
    },
    walls: {
      name: "Walls", cost: { scrap: 18 }, turns: 3,
      effectDesc: "Defence ×1.6 here",
      blurb: "Shipping containers, rebar teeth, glass-topped ramparts. A wall is a promise you make to your children."
    },
    barracks: {
      name: "Barracks", cost: { scrap: 16 }, turns: 2,
      effectDesc: "Unlocks Veterans; +2 garrison strength",
      blurb: "Drill yard, armoury, and a row of boots that came home empty. Here the wasteland's lessons get taught on purpose."
    },
    mast: {
      name: "Radio Mast", cost: { scrap: 20, fuel: 2 }, turns: 3,
      effectDesc: "+2 sight here, +0.5 knowledge; voices in the static",
      blurb: "A guyed lattice of hope and aerial wire. At night, half the stead gathers to hear the dead air crackle."
    },
    purifier: {
      name: "Purifier", cost: { scrap: 15 }, turns: 2,
      effectDesc: "+1 meds; doubles food from adjacent Blightfens; shrugs off black rain",
      blurb: "Sand, charcoal, prayer, and a mile of copper pipe. What goes in shouldn't be drunk. What comes out, can."
    }
  };

  /* ------------------------------------------------------------------ *
   * TECHNOLOGIES — "Remembrance". Three branches.
   * ------------------------------------------------------------------ */
  var TECHS = [
    /* Survival */
    { key: "seedvaults", name: "Seed Vaults", branch: "Survival", cost: 12,
      effectDesc: "+1 food in every settlement",
      blurb: "Heritage grain from a mountain's heart, viable after all these years. The first harvest makes grown farmers cry." },
    { key: "cleanwater", name: "Clean Water", branch: "Survival", cost: 10,
      effectDesc: "+0.5 meds in every settlement; +5 hope at once",
      blurb: "Filtration, chlorine, the boiling discipline. Children stop dying of the thing children died of. It changes a town's face." },
    { key: "fieldmed", name: "Field Medicine", branch: "Survival", cost: 16, prereq: "cleanwater",
      effectDesc: "Warbands heal twice as fast on friendly soil",
      blurb: "Tourniquets, maggot debridement, ether by the drop. War stops being a one-way door." },
    { key: "innoculants", name: "Rad Inoculants", branch: "Survival", cost: 24, prereq: "fieldmed",
      effectDesc: "The Glasslands stop hurting your people; you may settle the unsettleable",
      blurb: "Iodine, chelation, and a little of the Court's blood, if you ask no questions. The glass opens like a door." },

    /* Industry */
    { key: "tools", name: "Reforged Tools", branch: "Industry", cost: 12,
      effectDesc: "+20% scrap, faction-wide",
      blurb: "Hardened edges, true threads, a die-set that fits. Work that took ten hands takes four." },
    { key: "combustion", name: "Combustion", branch: "Industry", cost: 16, prereq: "tools",
      effectDesc: "Fuel stills +1; Raiders move further",
      blurb: "The engine cult's secret, written in burned knuckles: compression, spark, timing. The roads remember what they're for." },
    { key: "powder", name: "Plate & Powder", branch: "Industry", cost: 20, prereq: "tools",
      effectDesc: "+20% attack and defence, faction-wide",
      blurb: "Reliable primers and armour that turns a blade. Suddenly your militia walk like the old-world soldiers in the murals." },
    { key: "arcforge", name: "Arc Forges", branch: "Industry", cost: 26, prereq: "powder",
      effectDesc: "Construction one season faster",
      blurb: "Lightning on a leash, biting through steel plate. The forge quarter glows like a second dawn." },

    /* Signal */
    { key: "signal", name: "Signal Discipline", branch: "Signal", cost: 10,
      effectDesc: "+1 sight for all warbands; rival capitals marked on the map",
      blurb: "Call signs, dead drops, mirror-code. The wasteland starts whispering to you about itself." },
    { key: "crypto", name: "Cryptolexicon", branch: "Signal", cost: 18, prereq: "signal",
      effectDesc: "+1 knowledge per Archive; secrets surface in events",
      blurb: "The Archivists' gift or theft: a key to the old world's locked language. Half the static turns out to be sentences." },
    { key: "antenna", name: "The Long Antenna", branch: "Signal", cost: 26, prereq: "crypto",
      effectDesc: "Unlocks the Beacon — hold it, kindle it, end the silence",
      blurb: "Schematics for the spire on the horizon. It isn't a ruin. It's a question, and you finally know how to answer it." }
  ];

  /* The Beacon victory project. */
  var BEACON = {
    tech: "antenna",
    cost: { scrap: 60, fuel: 20 },
    turns: 6,
    name: "Kindle the Beacon"
  };

  /* ------------------------------------------------------------------ *
   * DIFFICULTY
   * ------------------------------------------------------------------ */
  var DIFFICULTY = {
    ember: { name: "Ember", desc: "A gentler ruin. More to start with, rivals slow to anger.",
             playerRes: 1.5, aiYield: 0.9, aiAggro: 0.6, harsh: 0.7 },
    ash: { name: "Ash", desc: "The wasteland as it is. Fair, which is to say: indifferent.",
           playerRes: 1.0, aiYield: 1.0, aiAggro: 1.0, harsh: 1.0 },
    cinder: { name: "Cinder", desc: "The wasteland on a bad year. Rivals thrive; storms hunt.",
              playerRes: 0.8, aiYield: 1.2, aiAggro: 1.4, harsh: 1.3 }
  };

  /* ------------------------------------------------------------------ *
   * BALANCE — the knobs, gathered in one place
   * ------------------------------------------------------------------ */
  var BALANCE = {
    mapW: 36, mapH: 24,
    startRes: { food: 22, scrap: 30, fuel: 8, meds: 5, know: 0 },
    startPop: 12,
    eatPerPop: 0.5,            // food per pop per season
    growthFood: 3,             // faction food surplus needed for growth tick
    growthChance: 0.5,         // per fed settlement per season
    maxBuildings: 6,
    settlementBaseYield: { food: 2, scrap: 1.5 },
    laborScrapPerPop: 0.1,
    fishFood: 0.5,             // per adjacent water tile
    healPerTurn: 8,            // hp regained on friendly soil
    radDamage: 12,             // hp per season standing in the glass
    stormDamage: 8,            // hp per season standing in a storm
    stormFoodTax: 2,           // food a storm steals from a settlement under it
    starvationHopeHit: 8,
    starvationPopHit: 1,
    deficitHpHit: 10,          // unpaid warbands rot
    hopeRegen: 1.5,            // per season when fed and unbothered
    warHopeDrag: 1,            // hope drag per season per active war
    revoltHope: 15,            // below this, bad events stalk you
    capitalFallHope: 25,
    battleRounds: 3,
    pillageLoot: 6,
    salvageHope: 2,
    dominionFrac: 0.6,         // share of all settlements for Dominion victory
    dominionMin: 8,
    eventChance: 0.55,         // narrative event chance per player turn
    maxSettlements: 9,
    aiMaxSettlements: 6
  };

  /* ------------------------------------------------------------------ *
   * EVENTS — the narrative deck.
   * cond(state, f) gates; weight may be number or fn; choices carry
   * declarative `effects` applied by events.js. `result` is aftermath prose.
   * AI factions resolve with aiScore weights.
   * ------------------------------------------------------------------ */
  function hasBuilding(state, f, key) {
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.settlement && t.owner === f.id && t.settlement.buildings.indexOf(key) !== -1) return true;
    }
    return false;
  }
  function factionAlive(state, key) {
    for (var i = 0; i < state.factions.length; i++)
      if (state.factions[i].key === key && state.factions[i].alive) return true;
    return false;
  }
  function settlementCount(state, f) {
    var n = 0;
    for (var i = 0; i < state.tiles.length; i++)
      if (state.tiles[i].settlement && state.tiles[i].owner === f.id) n++;
    return n;
  }

  var EVENTS = [
    {
      id: "wanderer", title: "The Wanderer at the Gate",
      text: "She walks out of the dust with no water, no rifle, and no fear — just a coat full of maps and a voice like gravel poured slow. She knows the land for fifty miles, she says. She'll trade what she knows for a place by the fire.",
      weight: 3, cooldown: 10,
      choices: [
        { label: "Give her the fire and the floor.",
          effects: { know: 4, hope: 2 },
          aiScore: 2,
          result: "She talks until the lamp burns dry: safe wells, bad bridges, which ruins still hum at night. By morning she's gone, and your maps are worth double." },
        { label: "Feed her and send her on. Strangers are strangers.",
          effects: { res: { food: -2 }, hope: 1 },
          aiScore: 1,
          result: "She takes the bread with a nod that might be respect. At the ridge she turns, points twice at the horizon — a warning or a blessing — and is gone." },
        { label: "Turn her away. The fire is for your own.",
          effects: { hope: -3 },
          aiScore: 0.5,
          result: "She doesn't argue. The sentries watch her shrink into the grey until she's a speck, then nothing. It is a long, quiet supper." }
      ]
    },
    {
      id: "blackrain", title: "Black Rain",
      text: "The clouds come in the colour of a bruise and the rain leaves stains. Cisterns scum over; the goats won't drink. The old folk spit and say it's the sky remembering the Fall.",
      weight: 2.5, cooldown: 8,
      condNot: function (state, f) { return false; },
      choices: [
        { label: "Dump the open stores. Lose food, keep your guts.",
          effects: { res: { food: -5 } },
          aiScore: 2,
          result: "It hurts to pour soup on the ground, but nobody's fever does the pouring for you. The cisterns are scrubbed by dawn." },
        { label: "Strain it, boil it, serve it. Hunger is also a poison.",
          effects: { hope: -4, res: { meds: -2 } },
          aiScore: 1,
          result: "Most keep it down. The clinic queue is long for a week, and a taste like batteries haunts every meal, but the stores hold." }
      ],
      purifierNote: "Your Purifier drinks the foul sky and exhales clean water. The stead barely notices."
    },
    {
      id: "vaultdoor", title: "A Door in the Earth",
      text: "Your scavengers found a vault door standing open exactly one hand's width — jammed for eighty years, or opened last night. Cold air breathes out of the dark with a smell of machine oil and, faintly, soap.",
      weight: 2, cooldown: 12,
      cond: function (state, f) { return settlementCount(state, f) > 0; },
      choices: [
        { label: "Burn fuel, rig lights, go in loud.",
          effects: { res: { fuel: -3, scrap: 18, know: 5 } },
          aiScore: 2,
          result: "Racks of tools wrapped in wax paper. A workshop. A skeleton in a chair facing the door, hands folded, patient as the hills. You leave it the smallest lamp." },
        { label: "Send one scout, quiet, with a candle.",
          effects: { res: { scrap: 7 }, know: 2, hope: -1 },
          aiScore: 1.5,
          result: "She comes back pale, with a satchel of hand tools and no interest in questions. 'It's empty,' she says, in the voice of someone who wishes it had been." },
        { label: "Seal it. Some doors are doors for a reason.",
          effects: { hope: 1 },
          aiScore: 0.5,
          result: "Welders close the gap by nightfall. Months later, travellers ask about the humming hill. You pour them another drink and change the subject." }
      ]
    },
    {
      id: "plague", title: "The Coughing Season",
      text: "It starts in the children, the way it always does: a dry cough with a whistle in it. By the second week there are red doors in every row. The herbalists are out of everything but opinions.",
      weight: 2, cooldown: 10,
      harsh: true,
      choices: [
        { label: "Spend medicine like water. Buy every life on the table.",
          effects: { res: { meds: -4 }, hope: 4 },
          aiScore: 2,
          result: "The clinic burns lamp oil for nine nights straight. You lose two elders and no children, and the stead remembers who paid for that." },
        { label: "Quarantine the rows. Cold arithmetic.",
          effects: { pop: -1, hope: -6 },
          aiScore: 1,
          result: "Chalk lines, food left on thresholds, songs sung through walls. It works, in the way a tourniquet works. The chalk washes away; other things don't." }
      ]
    },
    {
      id: "cache", title: "Strike in the Stacks",
      text: "A scavenger crew breaks through a collapsed floor into somebody's hoard: shrink-wrapped, labelled, untouched. Whoever stacked it died too far away to mind.",
      weight: 2.5, cooldown: 6,
      choices: [
        { label: "Haul the metal and machine parts.",
          effects: { res: { scrap: 12 } }, aiScore: 2,
          result: "Three days of sled-hauling and a new respect for the dead's shelving discipline." },
        { label: "Take the medical crates.",
          effects: { res: { meds: 5 }, hope: 2 }, aiScore: 1.5,
          result: "Bandages, iodine, sealed pills with legible labels. The clinic shelves look, briefly, like the pictures in the old books." },
        { label: "Strip the books and schematics.",
          effects: { know: 6 }, aiScore: 1.5,
          result: "Manuals, maps, a child's atlas of a world with oceans. The readers fight over it politely for a month." }
      ]
    },
    {
      id: "deserters", title: "Empty Bunks",
      text: "Morning muster comes up short. A warband's worth of blankets folded square, rations gone, a note held down by a rifle's bolt: 'Gone to find better. No hard feelings. Don't follow.'",
      weight: 2, cooldown: 8,
      cond: function (state, f) { return f.hope < 35; },
      choices: [
        { label: "Let them go. The wastes will make the argument.",
          effects: { damageUnits: { amount: 25, count: 2 } },
          aiScore: 2,
          result: "You post no pursuit. Weeks later a trader mentions bones at a dry well, and you stop wondering. The ones who stayed, stayed harder." },
        { label: "Open the stores and raise pay. Loyalty has a price; pay it.",
          effects: { res: { scrap: -8 }, hope: 5 },
          aiScore: 1.5,
          result: "Double rations and back pay in honest scrap. The grumbling dies to its usual simmer. Nobody folds their blanket square for a while." }
      ]
    },
    {
      id: "missionaries", title: "Singers on the Road",
      text: "Choir missionaries arrive at dusk, lamps green behind smoked glass, voices braided in harmony that makes the dogs lie down. They ask only to sing the night's service inside your walls.",
      weight: 2, cooldown: 12,
      cond: function (state, f) { return f.key !== "choir" && factionAlive(state, "choir"); },
      choices: [
        { label: "Let them sing.",
          effects: { hope: 4, rel: { choir: 12 }, flagged: "heardTheSong" },
          aiScore: 1.5,
          result: "The hymn has no words you know and several you almost do. People weep without embarrassment. In the morning the singers are gone, and the gate-post bears a small chalk sun." },
        { label: "Walls are for keeping songs out, too.",
          effects: { rel: { choir: -10 }, hope: -1 },
          aiScore: 1,
          result: "They bow, unbothered, and sing anyway — outside, facing your gate, until the small hours. Half the stead hears it in their sleep for a week." }
      ]
    },
    {
      id: "bazaar", title: "The Rolling Bazaar",
      text: "A Free Caravan convoy circles its trucks outside your gate and unfolds into a market: fuel by the jerrycan, salt, ammunition, a dentist's chair with a queue. The Route-Mistress tips her hat at your stores.",
      weight: 2.5, cooldown: 7,
      cond: function (state, f) { return f.key !== "caravan" && factionAlive(state, "caravan"); },
      choices: [
        { label: "Trade food for scrap and fuel.",
          effects: { res: { food: -6, scrap: 8, fuel: 3 }, rel: { caravan: 6 } },
          aiScore: 1.5,
          result: "Grain leaves, good steel arrives, and the convoy rolls out by moonlight playing music you'll hum for days." },
        { label: "Trade scrap for medicine.",
          effects: { res: { scrap: -8, meds: 4 }, rel: { caravan: 6 } },
          aiScore: 1.5,
          result: "Sealed pharmaceuticals with the old world's holograms still shifting on the labels. The Route-Mistress counts your scrap twice, smiles once." },
        { label: "Wave them on. Their prices are robbery in a friendly hat.",
          effects: { rel: { caravan: -5 } },
          aiScore: 1,
          result: "The convoy honks a sardonic little fanfare and grinds away. Your sentries watch its dust for hours, wallets intact, wanting." }
      ]
    },
    {
      id: "boneharvest", title: "What the Fen Gives",
      text: "The fen-skimmers come back overloaded: eels thick as arms, marsh-tuber, combs of grey honey. They also come back with a drowned man's locker, and what's in it was somebody's larder once. Protein is protein, says the cook, not quite meeting your eye.",
      weight: 1.5, cooldown: 14,
      cond: function (state, f) {
        for (var i = 0; i < state.tiles.length; i++) {
          var t = state.tiles[i];
          if (t.owner === f.id && t.terrain === "fen") return true;
        }
        return false;
      },
      choices: [
        { label: "The stores don't ask where the salt-meat came from.",
          effects: { res: { food: 9 }, hope: -4 },
          aiScore: 1.2,
          result: "Winter math wins. The barrels are filled and labelled in the cook's careful, unreadable hand, and nobody asks, ever, which is its own kind of knowing." },
        { label: "Bury it with words. You are not that hungry yet.",
          effects: { hope: 3 },
          aiScore: 1.2,
          result: "A short service over a long box. The fen takes him back with barely a ripple. The soup is thin that week and tastes, everyone agrees, just fine." }
      ]
    },
    {
      id: "glowchild", title: "The Unmarked Child",
      text: "A baby is born in your walls without a blemish — no ash-rash, no Glow-freckle, skin like the people in the old magazines. Word travels. Choir pilgrims arrive within the month, kneeling in the mud outside the gate, asking to see 'the Promise.'",
      weight: 1.2, cooldown: 99, once: true,
      cond: function (state, f) { return f.key !== "choir" && factionAlive(state, "choir"); },
      choices: [
        { label: "Let the pilgrims kneel. Pride costs nothing.",
          effects: { hope: 5, rel: { choir: 15 } },
          aiScore: 1.5,
          result: "They leave gifts that beggar sense — clean iodine, bolt cloth, a working clock. The mother is patient about the whole circus, the child loudly indifferent. The chalk suns multiply." },
        { label: "Close the gate. She is a child, not an omen.",
          effects: { hope: 2, rel: { choir: -15 } },
          aiScore: 1,
          result: "The pilgrims keep vigil for nine days, then go. Years from now she'll hear the story and roll her eyes, which is, you feel, the correct theology." }
      ]
    },
    {
      id: "tribute", title: "The Legion's Arithmetic",
      text: "A Legion outrider plants a spear at your gate with a stamped steel tag: your stead's name, a number, and a date one season out. The number is what protection costs. The date is when it stops being voluntary.",
      weight: 2, cooldown: 10,
      cond: function (state, f) {
        if (f.key === "legion" || !factionAlive(state, "legion")) return false;
        return !(f.atWar && f.atWar.legion);
      },
      choices: [
        { label: "Pay the tag. Buy a quiet season.",
          effects: { res: { scrap: -8 }, rel: { legion: 8 }, hope: -2 },
          aiScore: 1.2,
          result: "The scrap leaves in a Legion wagon with insulting punctuality. Quiet follows, as advertised. The taste stays." },
        { label: "Send the spear back bent.",
          effects: { rel: { legion: -25 }, hope: 3 },
          aiScore: 1,
          result: "The smith does the bending publicly, to applause. Your sentries double their watch and find themselves whistling. Whatever comes, it will not find you kneeling." }
      ]
    },
    {
      id: "frequency", title: "The Silent Frequency",
      text: "Past midnight, the radio operator wakes you. Every dial is lit. On a band that has carried nothing but hiss for eighty years: a tone, repeating, patient as a heartbeat. It is not random. It is counting.",
      weight: 1.5, cooldown: 16,
      cond: function (state, f) { return hasBuilding(state, f, "mast"); },
      choices: [
        { label: "Log it. Study it. Tell no one yet.",
          effects: { know: 6 },
          aiScore: 2,
          result: "Three nights of cipher work. It's a countdown — or a count-up — from somewhere east of anywhere you've mapped. On the fourth night it stops, mid-number, like a held breath." },
        { label: "Answer it.",
          effects: { know: 3, hope: 3, flagged: "answeredTheCount" },
          aiScore: 1,
          result: "Your operator taps the sequence back, hands shaking. Silence. Then, after eleven minutes: the same tone, shifted up a third. Almost — the operator will swear this to her grave — almost glad." }
      ]
    },
    {
      id: "refugees", title: "Out of the Glass",
      text: "They come at dawn, eleven of them, burned and bootless, walking out of the glasslands where nothing should walk. They carry one full waterskin and an infant, and they kept both alive the whole way. They ask for walls. Any walls.",
      weight: 2, cooldown: 9,
      choices: [
        { label: "Open the gate. People are the only crop that matters.",
          effects: { pop: 2, res: { food: -4 }, hope: 3 },
          aiScore: 1.8,
          result: "They eat like the starving and then, within days, work like the grateful. The infant's naming-feast empties a week's sugar ration. Nobody votes against it." },
        { label: "Water and directions. Your stores are a knife-edge already.",
          effects: { hope: -4, res: { food: -1 } },
          aiScore: 1,
          result: "You give what travel-mercy costs and point them at softer country. They thank you, which is worse than cursing. The sentries don't talk much that week." }
      ]
    },
    {
      id: "drownedbell", title: "The Drowned Bell",
      text: "On still nights, a bell tolls under the black water — slow, vast, and wrong, like something breathing through bronze. The fisherfolk have started leaving it offerings. The offerings have started disappearing.",
      weight: 1.2, cooldown: 14,
      cond: function (state, f) {
        for (var i = 0; i < state.tiles.length; i++) {
          var t = state.tiles[i];
          if (t.owner !== f.id || !t.settlement) continue;
          var adj = state.adj[t.i];
          for (var j = 0; j < adj.length; j++)
            if (state.tiles[adj[j]].terrain === "water") return true;
        }
        return false;
      },
      choices: [
        { label: "Dive on it. Bells hang in towers; towers hold things.",
          effects: { res: { scrap: 10 }, hope: -2, know: 2 },
          aiScore: 1.3,
          result: "A drowned chapel, a green-furred bell, a strongroom of church silver. The divers bring everything up and refuse, politely and permanently, to go back down." },
        { label: "Let the deep keep its appointments.",
          effects: { hope: 2 },
          aiScore: 1,
          result: "You ban the offerings instead, which the fisherfolk ignore, which you expected. The bell tolls on calm nights. Everyone pretends not to count the strokes." }
      ]
    },
    {
      id: "mutiny", title: "The Warband's Price",
      text: "Your fighters haven't been paid in honest scrap for too long, and tonight the camp is quiet in the specific way a forge is quiet before the metal moves. Their captain stands in your doorway, helmet under one arm, respectful as a drawn line.",
      weight: 2, cooldown: 8,
      cond: function (state, f) { return f.lastDeficit === true; },
      choices: [
        { label: "Empty the strongbox. Soldiers first, plans second.",
          effects: { res: { scrap: -7 }, hope: 3 },
          aiScore: 2,
          result: "Back pay by lamplight, counted into each palm. The captain is the last to take hers. At the door she says only: 'They'd have stayed anyway. Better they don't learn that.'" },
        { label: "Promises and rations. The strongbox stays shut.",
          effects: { damageUnits: { amount: 30, count: 1 }, hope: -4 },
          aiScore: 1,
          result: "Most stay. A knot of the hardest walk at dawn with their kit and no speech. The captain watches them go and says nothing to you for a season." }
      ]
    },
    {
      id: "greenshoot", title: "The Green Mile",
      text: "A runner comes in shouting. Out past the south markers, across a full mile of ash — grass. Real grass, knee-high, green as the old pictures, growing in a streak like something spilled and merciful. Nobody planted it. Everybody's claiming credit anyway.",
      weight: 1.4, cooldown: 99, once: true,
      choices: [
        { label: "Fence it, seed it, study it.",
          effects: { res: { food: 6 }, know: 3, hope: 6 },
          aiScore: 2,
          result: "The mile yields a harvest and, better, a lesson: the dirt under it runs clean. The maps get a new colour. People walk out just to stand in it." },
        { label: "Declare a feast day. Some miracles are for eating.",
          effects: { res: { food: 3 }, hope: 9 },
          aiScore: 1.5,
          result: "One golden afternoon: children hidden to the shoulders in green, elders barefoot and lying about remembering lawns. Years on, people will date things from the Day of the Grass." }
      ]
    },
    {
      id: "memory", title: "What the Stacks Hold",
      text: "Cataloguing the archive, a reader finds a sleeve of photographs: this exact valley, before. Orchards. A white church. A dog mid-leap into a river that no longer exists. The reading room goes quiet in a way that spreads down the hall.",
      weight: 1.6, cooldown: 12,
      cond: function (state, f) { return hasBuilding(state, f, "archive"); },
      choices: [
        { label: "Pin them up where everyone eats.",
          effects: { hope: 5, know: 1 },
          aiScore: 1.5,
          result: "Grief, then arguments about where the church stood, then — quietly, at the bottom of a ration-board — a sketch: the valley again, orchards again, drawn in somebody's careful future tense." },
        { label: "File them. The past is a tool, not a wound to pick.",
          effects: { know: 4, hope: -2 },
          aiScore: 1.2,
          result: "Indexed, cross-referenced, mined: the photos date the dam, locate two buried roads, and prove the river moved. The readers handle them with tongs and don't look long." }
      ]
    },
    {
      id: "feralhowl", title: "Teeth at the Fence",
      text: "Three nights running, the Court's howls have walked the ridgeline — closer each night, patient, conversational. The herd-dogs answer until they don't. On the fourth morning, a fence post wears a crown of chewed wire.",
      weight: 2, cooldown: 9,
      cond: function (state, f) { return f.key !== "feral" && factionAlive(state, "feral"); },
      choices: [
        { label: "Leave the winter-cull at the boundary stone.",
          effects: { res: { food: -5 }, rel: { feral: 10 } },
          aiScore: 1.3,
          result: "By dawn the carcasses are gone, the snow combed flat. A return gift sits on the stone: a rabbit, two ball bearings, and a child's mitten, all arranged with terrible neatness. A treaty, probably." },
        { label: "Double the watch and oil the guns.",
          effects: { res: { scrap: -3 }, rel: { feral: -8 }, hope: 1 },
          aiScore: 1.2,
          result: "The howls circle for one more night, mocking and unhurried, then move on to easier arithmetic. The dogs sleep in shifts for a month all the same." }
      ]
    },
    {
      id: "winterfeast", title: "Midwinter",
      text: "The Long Dark's deepest week. The stores are a held breath; the cold gets into the hinges of people. The cooks come to you with the question they come with every year: do we feast, or do we stretch?",
      weight: 3, cooldown: 3,
      cond: function (state, f) { return (state.turn - 1) % 4 === 3; },
      choices: [
        { label: "Feast. Light every lamp. Spit in the dark's eye.",
          effects: { res: { food: -6 }, hope: 8 },
          aiScore: 1.4,
          result: "Fat on the fire, music on cheap strings, the whole stead crammed warm into one long room. It costs a week of margin and buys a season of spine. The dark blinks first." },
        { label: "Stretch the stores. Spring is a promise to keep.",
          effects: { hope: -2 },
          aiScore: 1.4,
          result: "Thin soup, early nights, arithmetic by candlelight. Nobody sings, but nobody starves in the mud of Thaw, either. The cooks nod: a different kind of feast." }
      ]
    },
    {
      id: "prophet", title: "The Sandglass Prophet",
      text: "An old man sits down outside your gate, upends an hourglass of grey sand, and announces he will say one true thing when it runs out. A crowd gathers, because of course it does. The sand takes all day. He doesn't move once.",
      weight: 1.4, cooldown: 13,
      choices: [
        { label: "Hear him out.",
          effects: { tech: 5, hope: 1 },
          aiScore: 1.5,
          result: "The sand stops. He names a thing your artificers have been getting wrong — precisely, technically, using words he shouldn't know — then asks for soup. He is gone by morning, hourglass and all." },
        { label: "Move him along. The wastes are full of theatre.",
          effects: { hope: 0 },
          aiScore: 1,
          result: "He smiles, pockets the glass mid-pour, and leaves. Later, much later, you'll wonder what it was. This is, the elders note, exactly how that trick works." }
      ]
    },
    {
      id: "reactorleak", title: "The Reactor's Mood",
      text: "The old reactor's hum has changed key. The tap-crews report warm pipes, dead birds in the cooling pond, gauges doing slow arithmetic in the red. It gave for years without asking. It is asking now.",
      weight: 2, cooldown: 10,
      cond: function (state, f) {
        for (var i = 0; i < state.tiles.length; i++) {
          var t = state.tiles[i];
          if (t.owner === f.id && t.site === "reactor") return true;
        }
        return false;
      },
      choices: [
        { label: "Send the artificers in with lead and prayer.",
          effects: { res: { scrap: -6, meds: -2 }, know: 3 },
          aiScore: 2,
          result: "Nine hours in the hot dark. They come out grey, lighter by some unspoken amount, and the hum settles back to its old dull note. Their cups are never empty in any tavern of yours again." },
        { label: "Cap the taps and starve it quiet.",
          effects: { res: { fuel: -4 }, hope: -2 },
          aiScore: 1,
          result: "The valves close; the fuel line thins to a trickle. The hum fades to a sulk. Every artificer walks past the silent stacks like you'd walk past a sleeping bear." }
      ]
    },
    {
      id: "oldflag", title: "The Old Flag",
      text: "Scavengers bring back a flag from a government ruin — folded in plastic, colours still loud, the banner of the country this used to be. Half the stead wants it flown. Half wants it burned. All of them are watching you.",
      weight: 1.3, cooldown: 99, once: true,
      choices: [
        { label: "Fly it under your own colours. Memory in its place.",
          effects: { hope: 4 },
          aiScore: 1.5,
          result: "It goes up the mast below your own banner: an ancestor, not a ruler. The old folk salute it sidelong. The children ask good questions. It fades honestly in the wind." },
        { label: "Burn it. That country had its turn.",
          effects: { hope: 2, know: 1 },
          aiScore: 1,
          result: "It burns quick and bright, like it had been waiting to. An elder reads the eulogy: every good thing the old world built, every bill the new one is still paying. Ash to ash, the crowd answers. Ash to ash." }
      ]
    }
  ];

  return {
    TERRAIN: TERRAIN, TERRAIN_KEYS: TERRAIN_KEYS, SITES: SITES,
    SEASONS: SEASONS, FACTIONS: FACTIONS, UNITS: UNITS,
    BUILDINGS: BUILDINGS, TECHS: TECHS, BEACON: BEACON,
    DIFFICULTY: DIFFICULTY, BALANCE: BALANCE, EVENTS: EVENTS,
    helpers: { hasBuilding: hasBuilding, factionAlive: factionAlive, settlementCount: settlementCount }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
