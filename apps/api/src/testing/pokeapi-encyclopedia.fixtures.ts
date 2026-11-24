const API_V2 = 'https://pokeapi.co/api/v2';

export const RAW_MOVE_INDEX = {
  count: 3,
  results: [
    { name: 'pound', url: `${API_V2}/move/1/` },
    { name: 'thunderbolt', url: `${API_V2}/move/85/` },
    { name: 'thunder-wave', url: `${API_V2}/move/86/` },
  ],
};

export const RAW_THUNDERBOLT = {
  id: 85,
  name: 'thunderbolt',
  type: { name: 'electric', url: `${API_V2}/type/13/` },
  damage_class: { name: 'special', url: `${API_V2}/move-damage-class/3/` },
  power: 90,
  accuracy: 100,
  pp: 15,
  priority: 0,
  effect_chance: 10,
  target: { name: 'selected-pokemon', url: `${API_V2}/move-target/10/` },
  generation: { name: 'generation-i', url: `${API_V2}/generation/1/` },
  meta: {
    ailment: { name: 'paralysis', url: `${API_V2}/move-ailment/1/` },
    category: { name: 'damage+ailment', url: `${API_V2}/move-category/4/` },
  },
  stat_changes: [],
  effect_entries: [
    {
      effect:
        'Inflicts regular damage. Has a $effect_chance% chance to paralyze.',
      short_effect: 'Has a $effect_chance% chance to paralyze the target.',
      language: { name: 'en', url: `${API_V2}/language/9/` },
    },
  ],
  flavor_text_entries: [
    {
      flavor_text: 'A strong electric\nblast.',
      language: { name: 'en', url: `${API_V2}/language/9/` },
      version_group: { name: 'red-blue', url: `${API_V2}/version-group/1/` },
    },
  ],
  learned_by_pokemon: [{ name: 'pikachu', url: `${API_V2}/pokemon/25/` }],
};

export const RAW_GEN9_MOVE_NULL_META = {
  id: 900,
  name: 'tera-blast',
  type: { name: 'normal', url: `${API_V2}/type/1/` },
  damage_class: { name: 'special', url: `${API_V2}/move-damage-class/3/` },
  power: 80,
  accuracy: 100,
  pp: 10,
  priority: 0,
  effect_chance: null,
  target: { name: 'selected-pokemon', url: `${API_V2}/move-target/10/` },
  generation: { name: 'generation-ix', url: `${API_V2}/generation/9/` },
  meta: null,
  stat_changes: [],
  effect_entries: [],
  flavor_text_entries: [],
  learned_by_pokemon: [{ name: 'pikachu', url: `${API_V2}/pokemon/25/` }],
};

export const RAW_STATIC_ABILITY = {
  id: 9,
  name: 'static',
  is_main_series: true,
  generation: { name: 'generation-iii', url: `${API_V2}/generation/3/` },
  effect_entries: [
    {
      effect: 'Contact may paralyze the attacker.',
      short_effect: 'Paralyzes on contact.',
      language: { name: 'en', url: `${API_V2}/language/9/` },
    },
  ],
  flavor_text_entries: [
    {
      flavor_text: 'Causes paralysis on contact.',
      language: { name: 'en', url: `${API_V2}/language/9/` },
      version_group: {
        name: 'ruby-sapphire',
        url: `${API_V2}/version-group/5/`,
      },
    },
  ],
  pokemon: [
    {
      is_hidden: false,
      slot: 1,
      pokemon: { name: 'pikachu', url: `${API_V2}/pokemon/25/` },
    },
  ],
};

export const RAW_LIGHT_BALL_ITEM = {
  id: 236,
  name: 'light-ball',
  cost: 1000,
  fling_power: 30,
  fling_effect: { name: 'paralyze', url: `${API_V2}/item-fling-effect/4/` },
  category: { name: 'held-items', url: `${API_V2}/item-category/12/` },
  attributes: [{ name: 'holdable', url: `${API_V2}/item-attribute/5/` }],
  sprites: {
    default:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/light-ball.png',
  },
  effect_entries: [
    {
      effect: 'Held by Pikachu: doubles Attack and Sp. Atk.',
      short_effect: 'Doubles Pikachu Attack and Sp. Atk.',
      language: { name: 'en', url: `${API_V2}/language/9/` },
    },
  ],
  flavor_text_entries: [
    {
      text: 'An orb held by\nPikachu.',
      language: { name: 'en', url: `${API_V2}/language/9/` },
      version_group: { name: 'emerald', url: `${API_V2}/version-group/6/` },
    },
  ],
  held_by_pokemon: [
    {
      pokemon: { name: 'pikachu', url: `${API_V2}/pokemon/25/` },
      version_details: [
        {
          rarity: 5,
          version: { name: 'emerald', url: `${API_V2}/version/9/` },
        },
        { rarity: 1, version: { name: 'ruby', url: `${API_V2}/version/7/` } },
      ],
    },
  ],
};

export const RAW_CHERI_BERRY = {
  id: 1,
  name: 'cheri',
  growth_time: 3,
  max_harvest: 5,
  natural_gift_power: 80,
  natural_gift_type: { name: 'fire', url: `${API_V2}/type/10/` },
  size: 20,
  smoothness: 25,
  soil_dryness: 15,
  firmness: { name: 'soft', url: `${API_V2}/berry-firmness/2/` },
  item: { name: 'cheri-berry', url: `${API_V2}/item/126/` },
  flavors: [
    {
      potency: 10,
      flavor: { name: 'spicy', url: `${API_V2}/berry-flavor/1/` },
    },
  ],
};

export const RAW_KANTO_REGION = {
  id: 1,
  name: 'kanto',
  main_generation: { name: 'generation-i', url: `${API_V2}/generation/1/` },
  pokedexes: [{ name: 'kanto', url: `${API_V2}/pokedex/2/` }],
  version_groups: [{ name: 'red-blue', url: `${API_V2}/version-group/1/` }],
  locations: [{ name: 'viridian-forest', url: `${API_V2}/location/67/` }],
};

export const RAW_HISUI_REGION = {
  id: 9,
  name: 'hisui',
  main_generation: null,
  pokedexes: [{ name: 'hisui', url: `${API_V2}/pokedex/30/` }],
  version_groups: [
    { name: 'legends-arceus', url: `${API_V2}/version-group/24/` },
  ],
  locations: [],
};

export const RAW_KANTO_POKEDEX = {
  id: 2,
  name: 'kanto',
  is_main_series: true,
  region: { name: 'kanto', url: `${API_V2}/region/1/` },
  descriptions: [
    {
      description: 'Original Kanto Pokédex',
      language: { name: 'en', url: `${API_V2}/language/9/` },
    },
  ],
  version_groups: [{ name: 'red-blue', url: `${API_V2}/version-group/1/` }],
  pokemon_entries: [
    {
      entry_number: 25,
      pokemon_species: {
        name: 'pikachu',
        url: `${API_V2}/pokemon-species/25/`,
      },
    },
  ],
};

export const RAW_VIRIDIAN_LOCATION = {
  id: 67,
  name: 'viridian-forest',
  region: { name: 'kanto', url: `${API_V2}/region/1/` },
  names: [
    {
      name: 'Viridian Forest',
      language: { name: 'en', url: `${API_V2}/language/9/` },
    },
  ],
  areas: [
    { name: 'viridian-forest-area', url: `${API_V2}/location-area/300/` },
  ],
  game_indices: [
    {
      game_index: 67,
      generation: { name: 'generation-i', url: `${API_V2}/generation/1/` },
    },
  ],
};

export const RAW_FAIRY_EGG_GROUP = {
  id: 6,
  name: 'fairy',
  pokemon_species: [{ name: 'pikachu', url: `${API_V2}/pokemon-species/25/` }],
};

export const RAW_MEDIUM_GROWTH_RATE = {
  id: 2,
  name: 'medium',
  formula: String.raw`\frac{5x^3}{4}`,
  descriptions: [
    {
      description: 'medium',
      language: { name: 'en', url: `${API_V2}/language/9/` },
    },
  ],
  levels: [
    { level: 2, experience: 8 },
    { level: 1, experience: 0 },
  ],
  pokemon_species: [{ name: 'pikachu', url: `${API_V2}/pokemon-species/25/` }],
};

export const RAW_NATURE_INDEX = {
  count: 2,
  results: [
    { name: 'hardy', url: `${API_V2}/nature/1/` },
    { name: 'adamant', url: `${API_V2}/nature/11/` },
  ],
};

export const RAW_HARDY_NATURE = {
  id: 1,
  name: 'hardy',
  increased_stat: null,
  decreased_stat: null,
  likes_flavor: null,
  hates_flavor: null,
};

export const RAW_ADAMANT_NATURE = {
  id: 11,
  name: 'adamant',
  increased_stat: { name: 'attack', url: `${API_V2}/stat/2/` },
  decreased_stat: { name: 'special-attack', url: `${API_V2}/stat/4/` },
  likes_flavor: { name: 'spicy', url: `${API_V2}/berry-flavor/1/` },
  hates_flavor: { name: 'dry', url: `${API_V2}/berry-flavor/2/` },
};

export const RAW_TYPE_INDEX = {
  count: 1,
  results: [{ name: 'electric', url: `${API_V2}/type/13/` }],
};

export const RAW_ELECTRIC_FULL_TYPE = {
  id: 13,
  name: 'electric',
  generation: { name: 'generation-i', url: `${API_V2}/generation/1/` },
  move_damage_class: { name: 'special', url: `${API_V2}/move-damage-class/3/` },
  damage_relations: {
    double_damage_from: [{ name: 'ground', url: `${API_V2}/type/5/` }],
    half_damage_from: [
      { name: 'flying', url: `${API_V2}/type/3/` },
      { name: 'steel', url: `${API_V2}/type/9/` },
      { name: 'electric', url: `${API_V2}/type/13/` },
    ],
    no_damage_from: [],
    double_damage_to: [
      { name: 'flying', url: `${API_V2}/type/3/` },
      { name: 'water', url: `${API_V2}/type/11/` },
    ],
    half_damage_to: [
      { name: 'grass', url: `${API_V2}/type/12/` },
      { name: 'electric', url: `${API_V2}/type/13/` },
      { name: 'dragon', url: `${API_V2}/type/16/` },
    ],
    no_damage_to: [{ name: 'ground', url: `${API_V2}/type/5/` }],
  },
  pokemon: [
    { slot: 1, pokemon: { name: 'pikachu', url: `${API_V2}/pokemon/25/` } },
  ],
  moves: [{ name: 'thunderbolt', url: `${API_V2}/move/85/` }],
};
