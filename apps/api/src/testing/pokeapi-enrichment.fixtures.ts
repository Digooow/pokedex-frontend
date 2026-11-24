export const POKEAPI_SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const RAW_CHARIZARD = {
  id: 6,
  name: 'charizard',
  order: 7,
  is_default: true,
  height: 17,
  weight: 905,
  base_experience: 267,
  species: {
    name: 'charizard',
    url: 'https://pokeapi.co/api/v2/pokemon-species/6/',
  },
  types: [
    {
      slot: 1,
      type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' },
    },
    {
      slot: 2,
      type: { name: 'flying', url: 'https://pokeapi.co/api/v2/type/3/' },
    },
  ],
  abilities: [
    {
      is_hidden: false,
      slot: 1,
      ability: { name: 'blaze', url: 'https://pokeapi.co/api/v2/ability/66/' },
    },
  ],
  stats: [
    {
      base_stat: 78,
      effort: 0,
      stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' },
    },
    {
      base_stat: 84,
      effort: 0,
      stat: { name: 'attack', url: 'https://pokeapi.co/api/v2/stat/2/' },
    },
    {
      base_stat: 78,
      effort: 0,
      stat: { name: 'defense', url: 'https://pokeapi.co/api/v2/stat/3/' },
    },
    {
      base_stat: 109,
      effort: 3,
      stat: {
        name: 'special-attack',
        url: 'https://pokeapi.co/api/v2/stat/4/',
      },
    },
    {
      base_stat: 85,
      effort: 0,
      stat: {
        name: 'special-defense',
        url: 'https://pokeapi.co/api/v2/stat/5/',
      },
    },
    {
      base_stat: 100,
      effort: 0,
      stat: { name: 'speed', url: 'https://pokeapi.co/api/v2/stat/6/' },
    },
  ],
  sprites: {
    front_default: `${POKEAPI_SPRITE_BASE}/6.png`,
    other: {
      'official-artwork': {
        front_default: `${POKEAPI_SPRITE_BASE}/other/official-artwork/6.png`,
      },
      showdown: {
        front_default: `${POKEAPI_SPRITE_BASE}/other/showdown/6.gif`,
      },
    },
    versions: {
      'generation-i': {
        'red-blue': {
          front_default: `${POKEAPI_SPRITE_BASE}/versions/generation-i/red-blue/6.png`,
        },
      },
    },
  },
  cries: {
    latest:
      'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/6.ogg',
  },
  moves: [
    {
      move: { name: 'flamethrower', url: 'https://pokeapi.co/api/v2/move/53/' },
      version_group_details: [
        {
          level_learned_at: 36,
          move_learn_method: {
            name: 'level-up',
            url: 'https://pokeapi.co/api/v2/move-learn-method/1/',
          },
          version_group: {
            name: 'red-blue',
            url: 'https://pokeapi.co/api/v2/version-group/1/',
          },
        },
      ],
    },
  ],
  held_items: [],
  forms: [
    { name: 'charizard', url: 'https://pokeapi.co/api/v2/pokemon-form/6/' },
  ],
  past_types: [],
  past_abilities: [],
  past_stats: [],
};

export const RAW_CHARIZARD_MEGA_X = {
  ...RAW_CHARIZARD,
  id: 10034,
  name: 'charizard-mega-x',
  is_default: false,
  types: [
    {
      slot: 1,
      type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' },
    },
    {
      slot: 2,
      type: { name: 'dragon', url: 'https://pokeapi.co/api/v2/type/16/' },
    },
  ],
  forms: [
    {
      name: 'charizard-mega-x',
      url: 'https://pokeapi.co/api/v2/pokemon-form/10034/',
    },
  ],
};

export const RAW_CHARIZARD_SPECIES = {
  id: 6,
  name: 'charizard',
  capture_rate: 45,
  base_happiness: 50,
  gender_rate: 1,
  has_gender_differences: false,
  hatch_counter: 20,
  growth_rate: {
    name: 'medium-slow',
    url: 'https://pokeapi.co/api/v2/growth-rate/4/',
  },
  color: { name: 'red', url: 'https://pokeapi.co/api/v2/pokemon-color/8/' },
  shape: { name: 'upright', url: 'https://pokeapi.co/api/v2/pokemon-shape/6/' },
  habitat: {
    name: 'mountain',
    url: 'https://pokeapi.co/api/v2/pokemon-habitat/4/',
  },
  generation: {
    name: 'generation-i',
    url: 'https://pokeapi.co/api/v2/generation/1/',
  },
  is_baby: false,
  is_legendary: false,
  is_mythical: false,
  forms_switchable: false,
  egg_groups: [
    { name: 'monster', url: 'https://pokeapi.co/api/v2/egg-group/1/' },
  ],
  pokedex_numbers: [
    {
      entry_number: 6,
      pokedex: {
        name: 'national',
        url: 'https://pokeapi.co/api/v2/pokedex/1/',
      },
    },
  ],
  evolves_from_species: {
    name: 'charmeleon',
    url: 'https://pokeapi.co/api/v2/pokemon-species/5/',
  },
  evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' },
  genera: [
    {
      genus: 'Flame Pokémon',
      language: { name: 'en', url: 'https://pokeapi.co/api/v2/language/9/' },
    },
  ],
  flavor_text_entries: [
    {
      flavor_text: 'Spits fire that\nis hot enough to\fmelt boulders.',
      language: { name: 'en', url: 'https://pokeapi.co/api/v2/language/9/' },
      version: { name: 'red', url: 'https://pokeapi.co/api/v2/version/1/' },
    },
  ],
  varieties: [
    {
      is_default: true,
      pokemon: {
        name: 'charizard',
        url: 'https://pokeapi.co/api/v2/pokemon/6/',
      },
    },
    {
      is_default: false,
      pokemon: {
        name: 'charizard-mega-x',
        url: 'https://pokeapi.co/api/v2/pokemon/10034/',
      },
    },
  ],
};

export const RAW_EVOLUTION_CHAIN = {
  id: 2,
  baby_trigger_item: null,
  chain: {
    is_baby: false,
    species: {
      name: 'charmander',
      url: 'https://pokeapi.co/api/v2/pokemon-species/4/',
    },
    evolution_details: [],
    evolves_to: [
      {
        is_baby: false,
        species: {
          name: 'charmeleon',
          url: 'https://pokeapi.co/api/v2/pokemon-species/5/',
        },
        evolution_details: [
          {
            trigger: {
              name: 'level-up',
              url: 'https://pokeapi.co/api/v2/evolution-trigger/1/',
            },
            min_level: 16,
            needs_overworld_rain: false,
            time_of_day: '',
            turn_upside_down: false,
          },
        ],
        evolves_to: [
          {
            is_baby: false,
            species: {
              name: 'charizard',
              url: 'https://pokeapi.co/api/v2/pokemon-species/6/',
            },
            evolution_details: [
              {
                trigger: {
                  name: 'level-up',
                  url: 'https://pokeapi.co/api/v2/evolution-trigger/1/',
                },
                min_level: 36,
                needs_overworld_rain: false,
                time_of_day: '',
                turn_upside_down: false,
              },
            ],
            evolves_to: [],
          },
        ],
      },
    ],
  },
};

export const RAW_TYPE_MAP: Readonly<Record<string, unknown>> = {
  fire: {
    name: 'fire',
    damage_relations: {
      double_damage_from: [
        { name: 'water', url: 'https://pokeapi.co/api/v2/type/11/' },
        { name: 'ground', url: 'https://pokeapi.co/api/v2/type/5/' },
        { name: 'rock', url: 'https://pokeapi.co/api/v2/type/6/' },
      ],
      half_damage_from: [
        { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' },
        { name: 'grass', url: 'https://pokeapi.co/api/v2/type/12/' },
        { name: 'bug', url: 'https://pokeapi.co/api/v2/type/7/' },
      ],
      no_damage_from: [],
    },
  },
  flying: {
    name: 'flying',
    damage_relations: {
      double_damage_from: [
        { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' },
        { name: 'ice', url: 'https://pokeapi.co/api/v2/type/15/' },
        { name: 'rock', url: 'https://pokeapi.co/api/v2/type/6/' },
      ],
      half_damage_from: [
        { name: 'grass', url: 'https://pokeapi.co/api/v2/type/12/' },
        { name: 'fighting', url: 'https://pokeapi.co/api/v2/type/2/' },
        { name: 'bug', url: 'https://pokeapi.co/api/v2/type/7/' },
      ],
      no_damage_from: [
        { name: 'ground', url: 'https://pokeapi.co/api/v2/type/5/' },
      ],
    },
  },
  dragon: {
    name: 'dragon',
    damage_relations: {
      double_damage_from: [
        { name: 'ice', url: 'https://pokeapi.co/api/v2/type/15/' },
        { name: 'dragon', url: 'https://pokeapi.co/api/v2/type/16/' },
        { name: 'fairy', url: 'https://pokeapi.co/api/v2/type/18/' },
      ],
      half_damage_from: [
        { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' },
        { name: 'water', url: 'https://pokeapi.co/api/v2/type/11/' },
      ],
      no_damage_from: [],
    },
  },
};
