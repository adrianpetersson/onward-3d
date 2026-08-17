import type { IControl } from 'maplibre-gl'

/**
 * The button that puts the Itinerary back on screen.
 *
 * #24 settled that the camera frames **once, on load** — re-framing on every save is hostile, because
 * flying down to check a Stay Marker, fixing a typo and saving would yank the camera back out. But
 * framing only on load strands the traveller: once he has flown to an island there is no route back to
 * the overview short of scrolling out by hand. This is that route.
 *
 * **It frames the Stops — the same thing the load does, not more.** The obvious second job, "show me
 * the whole thing including Copenhagen", was considered and dropped: it would mean that after flying
 * to Koh Kradan, pressing the only button on screen throws you out to a globe rather than back to your
 * trip, which is worse than not having the button. The Origin-inclusive frame is a zoom-out away.
 *
 * A MapLibre `IControl` rather than React chrome because it is map furniture and belongs in the same
 * stack as the zoom and compass, styled by the same CSS the rest of the controls already load.
 */
export class FrameControl implements IControl {
  private container: HTMLDivElement | undefined

  /**
   * Called on click. A callback rather than a Trip, because the control outlives any one Trip — the
   * caller reads whatever the latest committed Itinerary is at the moment of the press.
   */
  constructor(private readonly onFrame: () => void) {}

  onAdd(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    const button = document.createElement('button')
    button.type = 'button'
    button.title = 'Frame the trip'
    button.setAttribute('aria-label', 'Frame the trip')
    button.addEventListener('click', this.onFrame)

    // Four corner brackets — the standard "fit to contents" glyph, drawn to sit on MapLibre's own
    // 29 px control button without its own box.
    button.innerHTML = `
      <span class="maplibregl-ctrl-icon" aria-hidden="true" style="display:flex;align-items:center;justify-content:center">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1.5 5V1.5H5" />
          <path d="M10 1.5H13.5V5" />
          <path d="M13.5 10V13.5H10" />
          <path d="M5 13.5H1.5V10" />
        </svg>
      </span>
    `

    container.appendChild(button)
    this.container = container
    return container
  }

  onRemove(): void {
    this.container?.remove()
    this.container = undefined
  }
}
