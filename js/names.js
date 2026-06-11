/* ASHFALL — names.js
 * Procedural names: settlements, leaders, warbands.
 * Each faction has a naming culture so its people sound like themselves.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.names = (function () {

  var SETTLE_A = [
    "Rust", "Cinder", "Ash", "Grave", "Bone", "Slag", "Ember", "Grey", "Salt",
    "Iron", "Gloam", "Crow", "Briar", "Lantern", "Hollow", "Marrow", "Tallow",
    "Shard", "Murk", "Drift", "Coal", "Thorn", "Rook", "Pale", "Sour", "Wick",
    "Mire", "Flint", "Gutter", "Smoke", "Vesper", "Char"
  ];
  var SETTLE_B = [
    "well", "fall", "mark", "mill", "stead", "gate", "reach", "haven", "ditch",
    "fort", "yard", "moor", "crag", "hold", "burrow", "cross", "watch", "rest",
    "field", "barrow", "spire", "shore", "den", "fold", "wall", "pit", "row",
    "bridge", "kiln", "march", "hollow", "post"
  ];
  var SETTLE_THE = [
    "The Stacks", "The Wreck", "The Stilts", "The Furrows", "The Maw",
    "The Tangle", "The Span", "The Quiet", "The Lots", "The Shallows",
    "The Tines", "The Sump", "The Anvil", "The Steps", "The Bonefields"
  ];

  /* Syllable pools per naming culture. */
  var CULTURES = {
    hearth: { // plain old-world names worn smooth
      first: ["Mara", "Edda", "Tom", "Bren", "Sera", "Joss", "Hale", "Petra",
              "Cole", "Ada", "Rolf", "Mona", "Garet", "Lise", "Aldous", "Tilda"],
      epithet: ["of the Furrows", "Greyhand", "the Steward", "Threadbare",
                "of Nine Winters", "the Patient", "Half-a-Loaf", "the Quiet",
                "Saltborn", "of the Long Table"]
    },
    legion: { // hard names taken, not given
      first: ["Krag", "Vasht", "Dren", "Skarn", "Brakka", "Ferrum", "Hask",
              "Morda", "Ruun", "Tarsk", "Velga", "Korr", "Ashka", "Grom"],
      epithet: ["Ironjaw", "the Flayer", "Three-Scars", "of the Red Mile",
                "Hammerhand", "the Unbent", "Skullkeeper", "Warborn",
                "the Siegebreaker", "Rustfather", "Rustmother"]
    },
    choir: // luminous, unsettling
    {
      first: ["Seraphel", "Lumen", "Cantor", "Vesperine", "Halix", "Orison",
              "Radiel", "Mirelle", "Sanctus", "Evangel", "Cessily", "Thurible"],
      epithet: ["of the Third Dawn", "the Unburned", "Glow-Touched",
                "Voice of the Veil", "the Luminous", "Who Walked the Glass",
                "of the Choir Unending", "the Anointed"]
    },
    caravan: { // road names, trade names
      first: ["Jezza", "Okoro", "Vex", "Saoirse", "Demir", "Lupe", "Anchor",
              "Rida", "Castor", "Yuri", "Pemba", "Solveig", "Marrakesh", "Tally"],
      epithet: ["Two-Trucks", "the Broker", "of the Long Road", "Fairweight",
                "the Mapkeeper", "Spokeswoman", "Quartermaster", "the Honest",
                "of a Hundred Gates", "Tollfree"]
    },
    archive: { // monastic, indexed
      first: ["Lexa", "Codus", "Brother Halt", "Sister Vellum", "Indric",
              "Palimpsest", "Quill", "Marginalia", "Folio", "Sister Cipher",
              "Brother Gloss", "Tessera"],
      epithet: ["Keeper of the Ninth Shelf", "the Unredacted", "of the Deep Stacks",
                "Lexarch", "the Annotated", "Who Reads the Static",
                "Custodian", "of the Burned Library"]
    },
    feral: { // sounds chewed
      first: ["Gnash", "Howl", "Six", "Rasp", "Quillback", "Mange", "Vex",
              "Chitter", "Sallow", "Brackish", "Null", "Croak", "Whelp", "Burr"],
      epithet: ["of the Teeth", "Pale-Eye", "the Many-Fingered", "Glowdrinker",
                "Who Was Born Twice", "the Unskinned", "Den-Mother", "Longtooth"]
    }
  };

  var WARBAND_A = ["Grey", "Red", "Last", "Broken", "Salt", "Hollow", "First",
                   "Black", "Burned", "Silent", "Crooked", "Starving"];
  var WARBAND_B = ["Dogs", "Column", "Knives", "Watch", "Sons", "Daughters",
                   "Hands", "Banner", "Wheels", "Teeth", "Lanterns", "Mile"];

  function settlement(rand, used) {
    for (var tries = 0; tries < 40; tries++) {
      var name;
      if (rand() < 0.16) {
        name = SETTLE_THE[Math.floor(rand() * SETTLE_THE.length)];
      } else {
        name = SETTLE_A[Math.floor(rand() * SETTLE_A.length)] +
               SETTLE_B[Math.floor(rand() * SETTLE_B.length)];
      }
      if (!used || used.indexOf(name) === -1) {
        if (used) used.push(name);
        return name;
      }
    }
    return "Nameless-" + Math.floor(rand() * 999);
  }

  function leader(rand, culture) {
    var c = CULTURES[culture] || CULTURES.hearth;
    var first = c.first[Math.floor(rand() * c.first.length)];
    var ep = c.epithet[Math.floor(rand() * c.epithet.length)];
    return first + " " + ep;
  }

  function warband(rand) {
    return "the " + WARBAND_A[Math.floor(rand() * WARBAND_A.length)] + " " +
           WARBAND_B[Math.floor(rand() * WARBAND_B.length)];
  }

  return { settlement: settlement, leader: leader, warband: warband };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
