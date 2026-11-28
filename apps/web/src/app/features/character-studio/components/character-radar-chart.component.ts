import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHARACTER_ATTRIBUTES_META, type CharacterAttributes } from '@pokeverse/shared';

interface RadarVertex {
  readonly key: string;
  readonly shortLabel: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly outerX: number;
  readonly outerY: number;
  readonly labelX: number;
  readonly labelY: number;
}

const CX = 130;
const CY = 112;
const MAX_RADIUS = 68;
const LABEL_RADIUS = 92;

function buildPolygonPoints(scale: number, radii?: readonly number[]): string {
  const count = CHARACTER_ATTRIBUTES_META.length;
  return CHARACTER_ATTRIBUTES_META.map((_, idx) => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / count;
    const radius = radii ? (radii[idx] ?? 0) : MAX_RADIUS * scale;
    const x = (CX + Math.cos(angle) * radius).toFixed(1);
    const y = (CY + Math.sin(angle) * radius).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
}

@Component({
  selector: 'pv-character-radar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-radar-chart.component.html',
  styleUrl: './character-radar-chart.component.scss',
})
export class CharacterRadarChartComponent {
  readonly attributes = input.required<CharacterAttributes>();
  readonly caption = input<string>('Radar dos 7 Atributos');

  readonly maxScale = computed(() => {
    const vals = Object.values(this.attributes());
    return Math.max(12, ...vals);
  });

  readonly ringPolygons = [0.33, 0.66, 1].map((scale) => buildPolygonPoints(scale));

  readonly vertices = computed<readonly RadarVertex[]>(() => {
    const attrs = this.attributes();
    const ceiling = this.maxScale();
    const count = CHARACTER_ATTRIBUTES_META.length;
    return CHARACTER_ATTRIBUTES_META.map((meta, idx) => {
      const value = attrs[meta.key];
      const ratio = Math.min(1, Math.max(0.12, value / ceiling));
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / count;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        key: meta.key,
        shortLabel: meta.shortLabel,
        value,
        x: Number((CX + cos * MAX_RADIUS * ratio).toFixed(1)),
        y: Number((CY + sin * MAX_RADIUS * ratio).toFixed(1)),
        outerX: Number((CX + cos * MAX_RADIUS).toFixed(1)),
        outerY: Number((CY + sin * MAX_RADIUS).toFixed(1)),
        labelX: Number((CX + cos * LABEL_RADIUS).toFixed(1)),
        labelY: Number((CY + sin * LABEL_RADIUS).toFixed(1)),
      };
    });
  });

  readonly dataPolygon = computed(() =>
    this.vertices()
      .map((vertex) => `${vertex.x},${vertex.y}`)
      .join(' '),
  );
}
