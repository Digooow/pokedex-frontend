import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'pv-pokedex-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  template: `
    <div id="tampa-frente" class="aba-face aba-face--frente" [inert]="coverOpen() && !isAnimating()">
      <button
        type="button"
        id="btn-abrir-pokedex"
        class="pokedex-tampa-fechada"
        [disabled]="coverOpen() && !isAnimating()"
        [attr.aria-expanded]="coverOpen()"
        aria-controls="pokedex-ala-base pokedex-ala-scanner"
        [attr.aria-label]="coverOpen() ? 'Fechar Pokédex' : 'Abrir Pokédex'"
        (click)="onTriggerClick($event)"
      >
        <span class="ala-topo ala-topo--capa">
          <span class="pokedex-titulo-grupo">
            <span class="capa-titulo">Pokédex</span>
          </span>
          <span class="pokedex-luzes" aria-hidden="true">
            <span class="camera-lente-principal">
              <span class="camera-anel-externo">
                <span class="camera-barril-optico">
                  <span class="camera-vidro-safira"></span>
                </span>
              </span>
            </span>
            <span class="luz-trio">
              <span class="luz luz--vermelha"></span>
              <span class="luz luz--amarela"></span>
              <span class="luz luz--verde"></span>
            </span>
          </span>
        </span>

        <span class="tampa-corpo">
          <span class="tampa-dobradica-lateral" aria-hidden="true"></span>

          <span class="tampa-superficie">
            <span class="tampa-parafusos" aria-hidden="true">
              <span class="tampa-parafuso tampa-parafuso--sup-esq"></span>
              <span class="tampa-parafuso tampa-parafuso--sup-dir"></span>
              <span class="tampa-parafuso tampa-parafuso--inf-esq"></span>
              <span class="tampa-parafuso tampa-parafuso--inf-dir"></span>
            </span>

            <span class="tampa-placa-frontal" aria-hidden="true">
              <span class="tampa-linha-circuito"></span>
              <span class="tampa-emblema">
                <span class="emblema-faixa"></span>
                <span class="emblema-miolo"></span>
              </span>
              <span class="tampa-linha-circuito"></span>
            </span>

            <span class="tampa-trava-lateral" aria-hidden="true">
              <span class="trava-triangulo"></span>
            </span>

            <span class="tampa-rodape-hardware" aria-hidden="true">
              <span class="tampa-led-barra"></span>
              <span class="tampa-ranhuras">
                <span></span>
                <span></span>
                <span></span>
              </span>
              <span class="tampa-grade-eletronica"></span>
            </span>
          </span>
        </span>
      </button>
    </div>
  `,
})
export class PokedexCoverComponent {
  readonly coverOpen = input.required<boolean>();
  readonly isAnimating = input(false);
  readonly openRequested = output<void>();

  onTriggerClick(event: Event): void {
    event.stopPropagation();
    (event.currentTarget as HTMLElement | null)?.blur?.();
    this.openRequested.emit();
  }
}
