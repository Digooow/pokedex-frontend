import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  type AllocateAttributesInput,
  type CharacterListResponse,
  CharacterListResponseSchema,
  type CharacterSheet,
  CharacterSheetSchema,
  type CreateCharacterInput,
} from '@pokeverse/shared';
import { map, type Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CharacterApiClient {
  private readonly http = inject(HttpClient);

  listCharacters(limit = 20, offset = 0): Observable<CharacterListResponse> {
    return this.http
      .get<unknown>('/api/v1/characters', {
        params: { limit: String(limit), offset: String(offset) },
      })
      .pipe(map((raw) => CharacterListResponseSchema.parse(raw)));
  }

  getCharacter(characterId: string): Observable<CharacterSheet> {
    return this.http
      .get<unknown>(`/api/v1/characters/${encodeURIComponent(characterId)}`)
      .pipe(map((raw) => CharacterSheetSchema.parse(raw)));
  }

  createCharacter(input: CreateCharacterInput): Observable<CharacterSheet> {
    return this.http
      .post<unknown>('/api/v1/characters', input)
      .pipe(map((raw) => CharacterSheetSchema.parse(raw)));
  }

  allocateAttributes(
    characterId: string,
    input: AllocateAttributesInput,
  ): Observable<CharacterSheet> {
    return this.http
      .post<unknown>(
        `/api/v1/characters/${encodeURIComponent(characterId)}/attributes/allocate`,
        input,
      )
      .pipe(map((raw) => CharacterSheetSchema.parse(raw)));
  }
}
