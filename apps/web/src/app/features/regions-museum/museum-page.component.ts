import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { REGIONS_ATLAS_PREVIEW } from '../../shared/data/regions-atlas.data';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { MuseumRegionInspectorComponent } from './components/museum-region-inspector.component';
import { MuseumStore } from './museum.store';

@Component({
  selector: 'pv-museum-page',
  imports: [RouterLink, PvMainHeadingDirective, MuseumRegionInspectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './museum-page.component.html',
  styleUrl: './museum-page.component.scss',
})
export class MuseumPageComponent implements OnInit, OnDestroy {
  readonly museum = inject(MuseumStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly regions = REGIONS_ATLAS_PREVIEW;
  private querySub: Subscription | null = null;

  ngOnInit(): void {
    const initialRegion = this.route.snapshot.queryParamMap.get('regiao');
    this.museum.selectRegion(initialRegion ?? this.museum.selectedRegionId());

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const target = params.get('regiao')?.trim().toLowerCase();
      if (target && target !== this.museum.selectedRegionId()) {
        this.museum.selectRegion(target);
      }
    });
  }

  onSelectRegion(regionId: string): void {
    this.museum.selectRegion(regionId);
  }

  onOpenHolocron(speciesName: string): void {
    void this.router.navigate(['/pokedex'], {
      queryParams: { q: speciesName, mode: 'holocron' },
    });
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }
}
