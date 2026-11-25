import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REGIONS_ATLAS_PREVIEW } from '../../shared/data/regions-atlas.data';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';

@Component({
  selector: 'pv-museum-page',
  imports: [RouterLink, PvMainHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="museum-page" aria-labelledby="main-heading">
      <header class="museum-page__header">
        <div>
          <span class="museum-page__tag">ACESSO PÚBLICO • MÓDULO 02</span>
          <h1 id="main-heading" tabindex="-1" pvMainHeading class="museum-page__title">
            Museu das Regiões & História
          </h1>
          <p class="museum-page__subtitle">
            Base de entrada para o Atlas de Kanto a Paldea (o globo interativo 3D em Three.js entra
            na Fase 4).
          </p>
          <a
            [routerLink]="['/enciclopedia']"
            [queryParams]="{ cat: 'region' }"
            class="region-card__cta"
          >
            Explorar Enciclopédia &amp; Regiões →
          </a>
        </div>
      </header>

      <ul class="museum-grid">
        @for (region of regions; track region.id) {
          <li class="region-card">
            <span class="region-card__gen">{{ region.generation }}</span>
            <h2 class="region-card__name">{{ region.name }}</h2>
            <p class="region-card__landmark">{{ region.landmark }}</p>
            <a
              [routerLink]="['/pokedex']"
              [queryParams]="{ q: region.starterQuery }"
              class="region-card__cta"
            >
              Inspecionar inicial na Pokédex →
            </a>
          </li>
        }
      </ul>
    </section>
  `,
  styles: [
    `
      .museum-page {
        display: grid;
        gap: var(--pv-space-5);
        inline-size: min(64rem, 100%);
        margin-inline: auto;
        padding: var(--pv-space-5) var(--pv-space-3);
      }

      .museum-page__header {
        padding: var(--pv-space-4) var(--pv-space-5);
        border-radius: var(--pv-radius-md);
        border: 1px solid var(--pv-border-strong);
        background: oklch(17% 0.026 255 / 0.88);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.38);
      }

      @supports (backdrop-filter: blur(12px)) {
        .museum-page__header,
        .region-card {
          background: oklch(17% 0.026 255 / 0.8);
          backdrop-filter: blur(12px);
        }
      }

      :host-context(html[data-perf-tier='lite']) .museum-page__header,
      :host-context(html[data-perf-tier='lite']) .region-card {
        backdrop-filter: none;
        background: oklch(17% 0.026 255 / 0.94);
      }

      .museum-page__tag {
        display: inline-block;
        padding: 0.25rem 0.625rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-gold);
        background: oklch(14% 0.025 255 / 0.86);
        color: var(--pv-border-gold);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .museum-page__title {
        margin: var(--pv-space-2) 0 0;
        color: var(--pv-ink-primary);
        font-size: clamp(1.5rem, 3vw, 2.25rem);
      }

      .museum-page__subtitle {
        margin: var(--pv-space-2) 0 0;
        color: oklch(86% 0.016 250);
      }

      .museum-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
        gap: var(--pv-space-3);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .region-card {
        display: grid;
        gap: var(--pv-space-2);
        padding: var(--pv-space-4);
        border-radius: var(--pv-radius-md);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-surface);
      }

      .region-card__gen {
        font-size: 0.75rem;
        color: var(--pv-sapphire);
        font-weight: 700;
      }

      .region-card__name {
        margin: 0;
        font-size: 1.25rem;
      }

      .region-card__landmark {
        margin: 0;
        font-size: 0.875rem;
        color: var(--pv-ink-muted);
      }

      .region-card__cta {
        display: inline-flex;
        align-items: center;
        min-block-size: 2.75rem;
        color: var(--pv-border-gold);
        font-weight: 700;
        text-decoration: none;
      }
    `,
  ],
})
export class MuseumPageComponent {
  readonly regions = REGIONS_ATLAS_PREVIEW;
}
