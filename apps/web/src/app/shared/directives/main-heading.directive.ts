import { DestroyRef, Directive, ElementRef, Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MainLandmarkFocusService {
  private headingEl: HTMLElement | null = null;
  private mainEl: HTMLElement | null = null;

  registerHeading(el: HTMLElement): () => void {
    this.headingEl = el;
    return () => {
      if (this.headingEl === el) {
        this.headingEl = null;
      }
    };
  }

  registerMain(el: HTMLElement): () => void {
    this.mainEl = el;
    return () => {
      if (this.mainEl === el) {
        this.mainEl = null;
      }
    };
  }

  focusMainHeading(): void {
    (this.headingEl ?? this.mainEl)?.focus();
  }
}

@Directive({ selector: '[pvMainHeading]' })
export class PvMainHeadingDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusService = inject(MainLandmarkFocusService);

  constructor() {
    const unregister = this.focusService.registerHeading(this.elementRef.nativeElement);
    inject(DestroyRef).onDestroy(unregister);
  }
}

@Directive({ selector: '[pvMainLandmark]' })
export class PvMainLandmarkDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusService = inject(MainLandmarkFocusService);

  constructor() {
    const unregister = this.focusService.registerMain(this.elementRef.nativeElement);
    inject(DestroyRef).onDestroy(unregister);
  }
}
