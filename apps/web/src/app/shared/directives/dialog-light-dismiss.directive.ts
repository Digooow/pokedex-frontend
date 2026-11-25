import { Directive, ElementRef, HostListener, inject } from '@angular/core';

@Directive({
  selector: 'dialog[pvDialogLightDismiss]',
})
export class DialogLightDismissDirective {
  private readonly elementRef = inject<ElementRef<HTMLDialogElement>>(ElementRef);
  private pressedOutside = false;

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    this.pressedOutside = this.isOutsideBoundingBox(event, this.elementRef.nativeElement);
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const dialog = this.elementRef.nativeElement;
    if (this.pressedOutside && this.isOutsideBoundingBox(event, dialog)) {
      dialog.close();
    }
    this.pressedOutside = false;
  }

  private isOutsideBoundingBox(event: PointerEvent, dialog: HTMLDialogElement): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }
}
