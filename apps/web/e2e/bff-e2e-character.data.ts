import type http from 'node:http';
import {
  type CharacterAttributes,
  type CharacterOriginKey,
  type CharacterSheet,
  buildCharacterVitalsState,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  getCharacterOriginByKey,
  sanitizeCharacterDisplayName,
} from '@pokeverse/shared';

function createE2eCharacterSheet(params: {
  readonly id: string;
  readonly name: string;
  readonly originKey: CharacterOriginKey;
  readonly appearance: CharacterSheet['appearance'];
  readonly initialAttributes: CharacterAttributes;
}): CharacterSheet {
  const origin = getCharacterOriginByKey(params.originKey);
  const attrs = buildInitialAttributes(params.initialAttributes);
  const derived = computeCharacterDerivedVitals(1, attrs);
  const nowIso = new Date().toISOString();

  return {
    id: params.id,
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    name: sanitizeCharacterDisplayName(params.name),
    originKey: origin.key,
    originLabel: origin.label,
    startingRegionName: origin.startingRegionName,
    classlessMode: true,
    appearance: params.appearance,
    level: 1,
    totalSkillMilestones: 0,
    availableAttributePoints: 1,
    hexQ: origin.startingHex.q,
    hexR: origin.startingHex.r,
    hexZ: origin.startingHex.z,
    presenceMode: 'ONLINE',
    attributes: attrs,
    vitals: buildCharacterVitalsState({ originKey: origin.key, derived }),
    starterKit: [...origin.starterKit],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function handleE2eCharacterRoute(params: {
  readonly req: http.IncomingMessage;
  readonly res: http.ServerResponse;
  readonly pathname: string;
  readonly characters: Map<string, CharacterSheet>;
  readonly readRequestBody: (req: http.IncomingMessage) => Promise<string>;
  readonly writeJson: (
    res: http.ServerResponse,
    status: number,
    body: unknown,
    headers?: Record<string, string>,
  ) => void;
}): Promise<boolean> {
  const { req, res, pathname, characters, readRequestBody, writeJson } = params;
  if (!pathname.startsWith('/api/v1/characters')) {
    return false;
  }
  if (pathname === '/api/v1/characters' && req.method === 'GET') {
    const items = Array.from(characters.values());
    writeJson(res, 200, { items, total: items.length, limit: 20, offset: 0 });
    return true;
  }
  if (pathname === '/api/v1/characters' && req.method === 'POST') {
    const body = JSON.parse(await readRequestBody(req)) as {
      name: string;
      originKey: CharacterOriginKey;
      appearance: CharacterSheet['appearance'];
      initialAttributes: CharacterAttributes;
    };
    const id = `660e8400-e29b-41d4-a716-${String(characters.size + 1).padStart(12, '0')}`;
    const sheet = createE2eCharacterSheet({ id, ...body });
    characters.set(id, sheet);
    writeJson(res, 201, sheet);
    return true;
  }
  const allocSuffix = '/attributes/allocate';
  if (pathname.endsWith(allocSuffix) && req.method === 'POST') {
    const id = pathname.slice('/api/v1/characters/'.length, -allocSuffix.length);
    const existing = characters.get(id);
    if (!existing) {
      writeJson(res, 404, { message: 'Personagem não encontrado.' });
      return true;
    }
    const { allocations } = JSON.parse(await readRequestBody(req)) as {
      allocations: CharacterAttributes;
    };
    const nextAttrs: CharacterAttributes = {
      physique: existing.attributes.physique + allocations.physique,
      dexterity: existing.attributes.dexterity + allocations.dexterity,
      stamina: existing.attributes.stamina + allocations.stamina,
      magic: existing.attributes.magic + allocations.magic,
      perception: existing.attributes.perception + allocations.perception,
      willpower: existing.attributes.willpower + allocations.willpower,
      handling: existing.attributes.handling + allocations.handling,
    };
    const spent = Object.values(allocations).reduce((acc, val) => acc + val, 0);
    const nextVitals = computeCharacterDerivedVitals(existing.level, nextAttrs);
    const updated: CharacterSheet = {
      ...existing,
      availableAttributePoints: Math.max(0, existing.availableAttributePoints - spent),
      attributes: nextAttrs,
      vitals: buildCharacterVitalsState({
        originKey: existing.originKey,
        derived: nextVitals,
        current: existing.vitals,
      }),
      updatedAt: new Date().toISOString(),
    };
    characters.set(id, updated);
    writeJson(res, 200, updated);
    return true;
  }
  return false;
}
