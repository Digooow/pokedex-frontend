import type { CharacterAttributeKey } from './character-presets';

export type SkillPillarKey = 'combat' | 'arcane_tactics' | 'professions';

export interface CharacterSkillNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly label: string;
  readonly pillar: SkillPillarKey;
  readonly trainable: boolean;
  readonly primaryAttr: CharacterAttributeKey;
  readonly secondaryAttr: CharacterAttributeKey;
  readonly weight: number;
  readonly halfScaleK: number;
  readonly description: string;
}

export interface CharacterEmergentArchetype {
  readonly key: string;
  readonly label: string;
  readonly signatureSkills: readonly string[];
  readonly roleSummary: string;
}

export interface CharacterProfessionGroup {
  readonly key: string;
  readonly label: string;
  readonly skillIds: readonly string[];
  readonly summary: string;
}

export const SKILL_CASCADE_RATIOS = [1, 0.65, 0.45, 0.3, 0.2, 0.1] as const;

export const SKILL_PILLAR_META: ReadonlyArray<{
  readonly key: SkillPillarKey;
  readonly label: string;
  readonly hint: string;
}> = [
  {
    key: 'combat',
    label: 'Combate & Armas',
    hint: 'Cascata de armas manuais, distância e defesa.',
  },
  {
    key: 'arcane_tactics',
    label: 'Magia & Tática',
    hint: 'Canalização elemental, furtividade e resistências.',
  },
  {
    key: 'professions',
    label: 'Profissões & Ofícios',
    hint: 'Extração, criação artesanal, logística e domação.',
  },
];

const SKILL_RAW_ENTRIES: readonly string[] = [
  'weapons||Armas (Tronco)|combat|0|physique|dexterity|0.15|25|Fundamento universal para manejo marcial.',
  'melee_weapons|weapons|Armas Manuais|combat|0|physique|dexterity|0.15|25|Técnica de alcance curto, aparar e alavanca.',
  'swords|melee_weapons|Espadas|combat|1|physique|dexterity|0.20|30|Corte, estocada e postura equilibrada.',
  'two_handed_swords|swords|Espadas de Duas Mãos|combat|0|physique|stamina|0.20|30|Impacto pesado e guarda firme.',
  'greatswords|two_handed_swords|Espadas Largas|combat|1|physique|stamina|0.25|35|Inércia de golpe e quebra de postura.',
  'mastery_excalibur|greatswords|Maestria Única: Excalibur|combat|1|physique|willpower|0.35|40|Vínculo exclusivo, menor desgaste e golpe assinatura.',
  'daggers|melee_weapons|Adagas & Punhais|combat|1|dexterity|perception|0.22|30|Ataques velozes e exploração de brechas.',
  'shields|melee_weapons|Escudos & Aparar|combat|1|stamina|physique|0.22|30|Bloqueio ativo e redução de impacto.',
  'ranged_weapons|weapons|Armas à Distância|combat|0|perception|dexterity|0.18|25|Leitura de trajetória e cadência de disparo.',
  'bows|ranged_weapons|Arcos & Precisão|combat|1|perception|dexterity|0.25|30|Tiro longo, tensão e acerto crítico.',
  'magic_core||Magia Geral|arcane_tactics|1|magic|willpower|0.20|25|Canalização de éter e sustentação de encantos.',
  'fire_magic|magic_core|Piromancia (Fogo)|arcane_tactics|1|magic|perception|0.28|35|Chamas ofensivas e imbuimento térmico.',
  'light_magic|magic_core|Consagração & Luz|arcane_tactics|1|willpower|magic|0.28|35|Purificação, bênçãos e proteção de aliados.',
  'stealth_tactics||Furtividade & Camuflagem|arcane_tactics|1|dexterity|perception|0.26|30|Aproximação silenciosa e controle de detecção.',
  'adaptive_resist||Resistências Adaptativas|arcane_tactics|0|stamina|willpower|0.15|25|Adaptação fisiológica sob exposição real.',
  'fire_resist|adaptive_resist|Resistência a Fogo|arcane_tactics|1|stamina|willpower|0.24|30|Tolerância térmica adquirida em combate.',
  'curse_resist|adaptive_resist|Resistência a Maldições|arcane_tactics|1|willpower|stamina|0.26|30|Estabilidade mental contra medo e hexes.',
  'extraction||Extração & Campo|professions|0|physique|stamina|0.15|25|Coleta bruta de recursos naturais sem NPCs.',
  'mining|extraction|Mineração|professions|1|physique|stamina|0.25|30|Extração de veios metálicos e rocha dura.',
  'woodcutting|extraction|Corte de Madeira|professions|1|physique|stamina|0.22|30|Derrubada seletiva e preparo de toras.',
  'farming|extraction|Cultivo & Agricultura|professions|1|stamina|perception|0.24|30|Plantio sazonal e produção de rações.',
  'fishing|extraction|Pesca|professions|1|perception|dexterity|0.22|30|Pesca costeira e oceânica de alto valor.',
  'hunting|extraction|Caça & Esfola|professions|1|perception|dexterity|0.24|30|Rastreamento, abate limpo e couros.',
  'crafting||Transformação & Criação|professions|0|dexterity|magic|0.15|25|Beneficiamento de matéria-prima em bens.',
  'smithing|crafting|Ferraria & Armamento|professions|1|physique|dexterity|0.28|35|Forja assinada de lâminas, elmos e ferramentas.',
  'refining|crafting|Produção & Refino|professions|1|dexterity|stamina|0.22|30|Lingotes, tábuas, couro curtido e tecidos.',
  'alchemy|crafting|Alquimia|professions|1|magic|perception|0.28|35|Poções, antídotos, óleos e reagentes.',
  'cooking|crafting|Culinária|professions|1|perception|stamina|0.22|30|Rações duráveis e banquetes de fôlego.',
  'engineering|crafting|Construção & Engenharia|professions|1|physique|perception|0.26|35|Casas, pontes, oficinas e escoras de mina.',
  'logistics_society||Logística & Sociedade|professions|0|handling|perception|0.15|25|Conexão entre cidades, rotas e animais.',
  'cartography|logistics_society|Cartografia|professions|1|perception|magic|0.22|30|Mapas físicos negociáveis de relevo e cavernas.',
  'commerce|logistics_society|Comércio & Avaliação|professions|1|handling|perception|0.24|30|Precificação de mercado, contratos e caravanas.',
  'navigation|logistics_society|Navegação|professions|1|perception|willpower|0.22|30|Rotas marítimas, correntes e expedições.',
  'taming|logistics_society|Domação & Adestramento|professions|1|handling|willpower|0.28|35|Treino de montarias, bois de carga e pets.',
  'consecration|logistics_society|Pregação & Consagração|professions|1|willpower|handling|0.24|30|Ritos comunitários, bênçãos e proteção.',
];

function parseSkillNode(raw: string): CharacterSkillNode {
  const [
    id,
    parentRaw,
    label,
    pillarRaw,
    trainableRaw,
    primaryAttr,
    secondaryAttr,
    weightRaw,
    kRaw,
    description,
  ] = raw.split('|') as [
    string,
    string,
    string,
    SkillPillarKey,
    string,
    CharacterAttributeKey,
    CharacterAttributeKey,
    string,
    string,
    string,
  ];
  return {
    id,
    parentId: parentRaw || null,
    label,
    pillar: pillarRaw,
    trainable: trainableRaw === '1',
    primaryAttr,
    secondaryAttr,
    weight: Number(weightRaw),
    halfScaleK: Number(kRaw),
    description,
  };
}

export const CHARACTER_SKILL_NODES: readonly CharacterSkillNode[] = SKILL_RAW_ENTRIES.map((entry) =>
  parseSkillNode(entry),
);

const PROFESSION_GROUP_RAW: readonly string[] = [
  'extraction|Extração & Campo|mining,woodcutting,farming,fishing,hunting|Produzem toda a matéria-prima do mundo sem NPC fornecedor.',
  'crafting|Transformação & Criação|smithing,refining,alchemy,cooking,engineering|Transformam matéria bruta em itens assinados com durabilidade real.',
  'logistics|Logística, Ciência & Sociedade|cartography,commerce,navigation,taming,consecration|Sustentam caravanas, mapas negociáveis, contratos e templos.',
];

export const CHARACTER_PROFESSION_GROUPS: readonly CharacterProfessionGroup[] =
  PROFESSION_GROUP_RAW.map((raw) => {
    const [key, label, ids, summary] = raw.split('|') as [string, string, string, string];
    return { key, label, skillIds: ids.split(',').filter(Boolean), summary };
  });

const ARCHETYPE_RAW: readonly string[] = [
  'duelist|Espadachim Duelista|swords,greatswords,mastery_excalibur|Especialista em lâminas pesadas, guarda e ruptura de postura.',
  'ranger|Patrulheiro de Arco|bows,hunting,cartography|Combate à distância, leitura de terreno e rastreamento.',
  'arcanist|Arcanista Elemental|magic_core,fire_magic,curse_resist|Domínio de éter ofensivo e estabilidade contra maldições.',
  'guardian|Guardião Consagrado|shields,light_magic,consecration|Linha de frente defensiva com purificação e suporte.',
  'infiltrator|Infiltrador Alquimista|daggers,stealth_tactics,alchemy|Venenos, camuflagem tática e ataques críticos precisos.',
  'artisan|Mestre Ferreiro & Engenheiro|mining,smithing,engineering|Extrai ligas profundas, forja peças únicas e ergue estruturas.',
  'caravan|Barão da Caravana & Domador|farming,taming,commerce|Cria animais de carga, sustenta rotas e domina o mercado.',
];

export const CHARACTER_EMERGENT_ARCHETYPES: readonly CharacterEmergentArchetype[] =
  ARCHETYPE_RAW.map((raw) => {
    const [key, label, ids, roleSummary] = raw.split('|') as [string, string, string, string];
    return { key, label, signatureSkills: ids.split(',').filter(Boolean), roleSummary };
  });

export const DEFAULT_EMERGENT_ARCHETYPE: CharacterEmergentArchetype = {
  key: 'wanderer',
  label: 'Viajante Livre',
  signatureSkills: [],
  roleSummary: 'Sem classe fixa: treine qualquer arma, magia ou ofício para emergir seu estilo.',
};
