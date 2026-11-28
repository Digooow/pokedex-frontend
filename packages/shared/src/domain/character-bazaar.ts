import type { CharacterSheet } from '../schemas/character.schemas';
import { type CharacterAttributes, type CharacterBodyModel } from './character-presets';

export const BAZAAR_PLATFORM_FEE_RATE = 0.08;
export const BAZAAR_MIN_PRICE_COINS = 100;
export const BAZAAR_MAX_PRICE_COINS = 1_000_000;

export interface BazaarCommissionBreakdown {
  readonly grossCoins: number;
  readonly platformFeeCoins: number;
  readonly sellerNetCoins: number;
  readonly feePercent: number;
}

export interface CharacterBazaarListing {
  readonly id: string;
  readonly characterName: string;
  readonly bodyModel: CharacterBodyModel;
  readonly ageLabel: string;
  readonly originLabel: string;
  readonly archetypeLabel: string;
  readonly totalMilestones: number;
  readonly topSkills: readonly string[];
  readonly attributes: CharacterAttributes;
  readonly askingPriceCoins: number;
  readonly sellerAlias: string;
  readonly historyNote: string;
  readonly isPlayerListing: boolean;
}

export function computeBazaarCommission(askingPriceCoins: number): BazaarCommissionBreakdown {
  const clamped = Math.max(
    BAZAAR_MIN_PRICE_COINS,
    Math.min(BAZAAR_MAX_PRICE_COINS, Math.round(askingPriceCoins)),
  );
  const platformFeeCoins = Math.max(1, Math.round(clamped * BAZAAR_PLATFORM_FEE_RATE));
  return {
    grossCoins: clamped,
    platformFeeCoins,
    sellerNetCoins: clamped - platformFeeCoins,
    feePercent: Math.round(BAZAAR_PLATFORM_FEE_RATE * 100),
  };
}

const VETERAN_RAW_ENTRIES: readonly string[] = [
  'bazaar-thorne|Thorne Ferro-Vivo|male|3 anos e 2 meses|Andarilho das Montanhas|Mestre Ferreiro & Engenheiro|1420|Ferraria (84), Mineração (79), Espadas Largas (66)|24,14,22,7,14,15,10|18500|MestreAldo|Forjou armas assinadas da fronteira norte por 3 temporadas antes de se aposentar.',
  'bazaar-lyra|Lyra Vento-Sul|female|2 anos e 7 meses|Aprendiz de Porto|Barão da Caravana & Domador|1180|Domação (81), Comércio (76), Cultivo (68)|14,16,18,9,17,15,25|14200|MercadoraEva|Construiu rede de bois de carga entre 4 cidades; ideal para quem quer logística imediata.',
  'bazaar-cael|Cael Cinza-Rubi|male|1 ano e 11 meses|Filho de Colono|Infiltrador Alquimista|940|Alquimia (74), Adagas (71), Furtividade (69)|12,23,14,19,21,14,9|11800|AlquimistaSol|Especialista em poções raras e extração furtiva em cavernas profundas.',
  'bazaar-mira|Mira Luz-Alta|female|3 anos e 5 meses|Filho de Colono|Guardião Consagrado|1610|Escudos (86), Consagração (83), Res. Maldições (75)|20,14,24,18,15,24,13|21400|SentinelaMira|Veterana de cercos defensivos com resistências adaptativas já consolidadas.',
];

function parseVeteranAttributes(csv: string): CharacterAttributes {
  const nums = csv.split(',').map(Number);
  return {
    physique: nums[0] ?? 10,
    dexterity: nums[1] ?? 10,
    stamina: nums[2] ?? 10,
    magic: nums[3] ?? 10,
    perception: nums[4] ?? 10,
    willpower: nums[5] ?? 10,
    handling: nums[6] ?? 10,
  };
}

function parseVeteranListing(raw: string): CharacterBazaarListing {
  const [
    id,
    characterName,
    modelRaw,
    ageLabel,
    originLabel,
    archetypeLabel,
    milestonesRaw,
    topSkillsRaw,
    attrsCsv,
    priceRaw,
    sellerAlias,
    historyNote,
  ] = raw.split('|') as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    id,
    characterName,
    bodyModel: modelRaw === 'female' ? 'female' : 'male',
    ageLabel,
    originLabel,
    archetypeLabel,
    totalMilestones: Number(milestonesRaw),
    topSkills: topSkillsRaw.split(', ').filter(Boolean),
    attributes: parseVeteranAttributes(attrsCsv),
    askingPriceCoins: Number(priceRaw),
    sellerAlias,
    historyNote,
    isPlayerListing: false,
  };
}

export const BAZAAR_VETERAN_SHOWCASE: readonly CharacterBazaarListing[] = VETERAN_RAW_ENTRIES.map(
  (entry) => parseVeteranListing(entry),
);

export function buildBazaarListingFromSheet(params: {
  readonly sheet: CharacterSheet;
  readonly attributes: CharacterAttributes;
  readonly totalMilestones: number;
  readonly askingPriceCoins: number;
  readonly archetypeLabel: string;
  readonly topSkills: readonly string[];
  readonly sellerAlias: string;
}): CharacterBazaarListing {
  const commission = computeBazaarCommission(params.askingPriceCoins);
  return {
    id: `player-${params.sheet.id}`,
    characterName: params.sheet.name,
    bodyModel: params.sheet.appearance.bodyModel ?? 'male',
    ageLabel: 'Recém-anunciado',
    originLabel: params.sheet.originLabel,
    archetypeLabel: params.archetypeLabel,
    totalMilestones: params.totalMilestones,
    topSkills: params.topSkills,
    attributes: { ...params.attributes },
    askingPriceCoins: commission.grossCoins,
    sellerAlias: params.sellerAlias,
    historyNote: `Anúncio em custódia (Escrow): comissão da plataforma de ${commission.feePercent}% (${commission.platformFeeCoins} moedas).`,
    isPlayerListing: true,
  };
}
