/**
 * Reusable module / sensor / part library model.
 *
 * Module images are calibrated into a module-local millimeter coordinate
 * system. Millimeters are the source of truth for placement, snapping, and
 * breadboard alignment - the image is just the visual skin.
 */

import type { PinElectricalMetadata } from './pinElectrical'

/**
 * Schema version for `LibraryPartDefinition`. Bump when adding fields whose
 * absence in older saved modules would break runtime assumptions. Optional
 * fields can be added without bumping this — backward compatibility is
 * handled in `server/partLibraryStore.ts` normalizers.
 */
export const LIBRARY_PART_DEFINITION_VERSION = 1

export const PART_CATEGORIES = [
  'sensor',
  'module',
  'breakout-board',
  'microcontroller',
  'display',
  'power',
  'custom',
  'passive',
] as const

export type PartCategory = (typeof PART_CATEGORIES)[number]

export const PHYSICAL_POINT_KINDS = [
  'header-pin',
  'solder-pad',
  'test-pad',
  'mount-hole',
  'connector',
  'component-marker',
] as const

export type PhysicalPointKind = (typeof PHYSICAL_POINT_KINDS)[number]

export const IMAGE_VIEW_SIDES = ['top', 'bottom', 'side', 'perspective', 'other'] as const

export type ImageViewSide = (typeof IMAGE_VIEW_SIDES)[number]

export const PART_RESOURCE_KINDS = [
  'datasheet',
  'schematic',
  'pinout',
  'product-page',
  'purchase-link',
  'example-code',
  'note',
] as const

export type PartResourceKind = (typeof PART_RESOURCE_KINDS)[number]

/** Standard 0.1 inch header pin pitch in millimeters. */
export const DEFAULT_PIN_PITCH_MM = 2.54

/** A pixel coordinate inside an image view. */
export type ImagePoint = { x: number; y: number }

/** A point in module-local millimeter space. */
export type MmPoint = { xMm: number; yMm: number }

/**
 * Four corners of the module's bounding rectangle, identified in image pixel
 * space. Together with `widthMm` / `heightMm` these define the bilinear
 * mapping between image pixels and module-local millimeters.
 */
export type CalibrationCorners = {
  topLeft: ImagePoint
  topRight: ImagePoint
  bottomRight: ImagePoint
  bottomLeft: ImagePoint
}

export type PartImageCalibration = {
  corners: CalibrationCorners
  widthMm: number
  heightMm: number
}

export type PartImageView = {
  id: string
  label: string
  side: ImageViewSide
  imageName: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  calibration?: PartImageCalibration
}

export type LogicalPin = {
  id: string
  /** Short electrical name, e.g. "VIN", "GND", "SDA". */
  name: string
  description?: string
  function?: string
  /**
   * Optional generic electrical metadata. All fields are optional and the
   * connection-validation engine treats missing values as 'unknown' rather
   * than guessing. Adding new sub-fields here does not require a migration.
   */
  electrical?: PinElectricalMetadata
}

export type PhysicalPoint = {
  id: string
  /** ID of the `PartImageView` this point belongs to. */
  viewId: string
  kind: PhysicalPointKind
  /** Module-local position in millimeters, origin at the calibrated top-left corner. */
  xMm: number
  yMm: number
  label?: string
  /** Optional mapping back to a logical electrical pin. */
  logicalPinId?: string
  solderable?: boolean
  throughHole?: boolean
  diameterMm?: number
  notes?: string
  /**
   * Optional rail / net id. Points sharing the same `netId` are considered
   * electrically connected (used by the grid-fill tool's row/column linking).
   */
  netId?: string
}

export type PartResource = {
  id: string
  kind: PartResourceKind
  label: string
  url?: string
  notes?: string
}

export type LibraryPartDimensions = {
  widthMm: number
  heightMm: number
  thicknessMm?: number
}

export const LIBRARY_PART_KINDS = ['image-module', 'generated-passive'] as const
export type LibraryPartKind = (typeof LIBRARY_PART_KINDS)[number]

/**
  * Synthetic image-view id used to anchor `PhysicalPoint` entries on parts
  * that are rendered programmatically (e.g. generated passive components).
  * They have no underlying image, but reusing the same `viewId` field keeps
  * downstream snapping/rendering code simple.
  */
export const GENERATED_PASSIVE_VIEW_ID = 'generated'

export type LibraryPartDefinition = {
  id: string
  name: string
  category: PartCategory
  /**
    * Discriminator for how the part should be rendered. Defaults to the
    * existing image-based module behaviour for backwards compatibility.
    */
  kind?: LibraryPartKind
  manufacturer?: string
  modelNumber?: string
  aliases: string[]
  description?: string
  dimensions: LibraryPartDimensions
  imageViews: PartImageView[]
  logicalPins: LogicalPin[]
  physicalPoints: PhysicalPoint[]
  resources: PartResource[]
  /** Populated when `kind === 'generated-passive'`. */
  passive?: GeneratedPassiveSpec
  /**
   * Schema version. Older saved parts may omit this; loaders default to 1
   * for backwards compatibility.
   */
  definitionVersion?: number
  /** Free-form tags / categories (e.g. ['esp32', 'wifi', 'low-power']). */
  tags?: string[]
  notes?: string
  /** Convenience module-level link (also addable as `resources` entries). */
  datasheetUrl?: string
  schematicUrl?: string
  createdAt: string
  updatedAt: string
}

type LibraryPartDraft = Partial<
  Omit<
    LibraryPartDefinition,
    'aliases' | 'dimensions' | 'imageViews' | 'logicalPins' | 'physicalPoints' | 'resources' | 'passive'
  >
> & {
  aliases?: string[]
  dimensions?: Partial<LibraryPartDimensions>
  imageViews?: PartImageView[]
  logicalPins?: LogicalPin[]
  physicalPoints?: PhysicalPoint[]
  resources?: PartResource[]
  passive?: GeneratedPassiveSpec
}

// Forward declaration consumed in this module. The full structural type is
// defined in `generatedPassive.ts` to keep passive-specific concerns out of
// the core library model.
export type GeneratedPassiveSpec = import('./generatedPassive').GeneratedPassiveSpec

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

export function createLibraryPartId() {
  return createId('library-part')
}

export function createLogicalPinId() {
  return createId('logical-pin')
}

export function createPhysicalPointId() {
  return createId('physical-point')
}

export function createNetId() {
  return createId('net')
}

export function createImageViewId() {
  return createId('image-view')
}

export function createPartResourceId() {
  return createId('resource')
}

export function cloneLogicalPin(pin: LogicalPin): LogicalPin {
  const { electrical } = pin
  return {
    ...pin,
    electrical: electrical
      ? {
          ...electrical,
          voltageDomain: electrical.voltageDomain ? { ...electrical.voltageDomain } : undefined,
          currentLimits: electrical.currentLimits ? { ...electrical.currentLimits } : undefined,
          capabilities: electrical.capabilities ? [...electrical.capabilities] : undefined,
          aliases: electrical.aliases ? [...electrical.aliases] : undefined,
        }
      : undefined,
  }
}

export function cloneCalibration(calibration: PartImageCalibration): PartImageCalibration {
  return {
    corners: {
      topLeft: { ...calibration.corners.topLeft },
      topRight: { ...calibration.corners.topRight },
      bottomRight: { ...calibration.corners.bottomRight },
      bottomLeft: { ...calibration.corners.bottomLeft },
    },
    widthMm: calibration.widthMm,
    heightMm: calibration.heightMm,
  }
}

export function cloneImageView(view: PartImageView): PartImageView {
  return {
    ...view,
    calibration: view.calibration ? cloneCalibration(view.calibration) : undefined,
  }
}

export function clonePhysicalPoint(point: PhysicalPoint): PhysicalPoint {
  return { ...point }
}

export function clonePartResource(resource: PartResource): PartResource {
  return { ...resource }
}

export function cloneLibraryPart(part: LibraryPartDefinition): LibraryPartDefinition {
  return {
    ...part,
    aliases: [...part.aliases],
    dimensions: { ...part.dimensions },
    imageViews: part.imageViews.map(cloneImageView),
    logicalPins: part.logicalPins.map(cloneLogicalPin),
    physicalPoints: part.physicalPoints.map(clonePhysicalPoint),
    resources: part.resources.map(clonePartResource),
    passive: part.passive
      ? (JSON.parse(JSON.stringify(part.passive)) as GeneratedPassiveSpec)
      : undefined,
    tags: part.tags ? [...part.tags] : undefined,
  }
}

function defaultDimensions(): LibraryPartDimensions {
  return { widthMm: 0, heightMm: 0 }
}

export function createEmptyLibraryPart(draft: LibraryPartDraft = {}): LibraryPartDefinition {
  const timestamp = draft.createdAt ?? draft.updatedAt ?? new Date().toISOString()

  return {
    id: draft.id ?? createLibraryPartId(),
    name: draft.name ?? 'Untitled module',
    category: draft.category ?? 'module',
    kind: draft.kind ?? 'image-module',
    manufacturer: draft.manufacturer,
    modelNumber: draft.modelNumber,
    aliases: draft.aliases ? [...draft.aliases] : [],
    description: draft.description,
    dimensions: { ...defaultDimensions(), ...(draft.dimensions ?? {}) },
    imageViews: draft.imageViews?.map(cloneImageView) ?? [],
    logicalPins: draft.logicalPins?.map(cloneLogicalPin) ?? [],
    physicalPoints: draft.physicalPoints?.map(clonePhysicalPoint) ?? [],
    resources: draft.resources?.map(clonePartResource) ?? [],
    passive: draft.passive
      ? (JSON.parse(JSON.stringify(draft.passive)) as GeneratedPassiveSpec)
      : undefined,
    definitionVersion: draft.definitionVersion ?? LIBRARY_PART_DEFINITION_VERSION,
    tags: draft.tags ? [...draft.tags] : undefined,
    notes: draft.notes,
    datasheetUrl: draft.datasheetUrl,
    schematicUrl: draft.schematicUrl,
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: draft.updatedAt ?? timestamp,
  }
}

export function findImageView(part: LibraryPartDefinition, viewId: string) {
  return part.imageViews.find((view) => view.id === viewId)
}

export function findLogicalPin(part: LibraryPartDefinition, logicalPinId: string) {
  return part.logicalPins.find((pin) => pin.id === logicalPinId)
}

export function getPhysicalPointsForView(part: LibraryPartDefinition, viewId: string) {
  return part.physicalPoints.filter((point) => point.viewId === viewId)
}

export function getPhysicalPointsForLogicalPin(part: LibraryPartDefinition, logicalPinId: string) {
  return part.physicalPoints.filter((point) => point.logicalPinId === logicalPinId)
}

// ---------------------------------------------------------------------------
// Calibration math
// ---------------------------------------------------------------------------

/**
 * Map a millimeter coordinate to an image pixel coordinate using bilinear
 * interpolation across the four calibration corners.
 */
export function mmToImagePoint(
  calibration: PartImageCalibration,
  point: MmPoint,
): ImagePoint {
  const { corners, widthMm, heightMm } = calibration
  const u = widthMm > 0 ? point.xMm / widthMm : 0
  const v = heightMm > 0 ? point.yMm / heightMm : 0

  const topX = corners.topLeft.x + u * (corners.topRight.x - corners.topLeft.x)
  const topY = corners.topLeft.y + u * (corners.topRight.y - corners.topLeft.y)
  const bottomX = corners.bottomLeft.x + u * (corners.bottomRight.x - corners.bottomLeft.x)
  const bottomY = corners.bottomLeft.y + u * (corners.bottomRight.y - corners.bottomLeft.y)

  return {
    x: topX + v * (bottomX - topX),
    y: topY + v * (bottomY - topY),
  }
}

function cross2(ax: number, ay: number, bx: number, by: number) {
  return ax * by - ay * bx
}

/**
 * Inverse bilinear interpolation. Returns the parametric (u, v) coordinates of
 * `point` relative to the quadrilateral defined by the four corners. Uses the
 * closed-form solution from https://iquilezles.org/articles/ibilinear/.
 */
function inverseBilinear(corners: CalibrationCorners, point: ImagePoint): { u: number; v: number } {
  const a = corners.topLeft
  const b = corners.topRight
  const c = corners.bottomRight
  const d = corners.bottomLeft

  const ex = b.x - a.x
  const ey = b.y - a.y
  const fx = d.x - a.x
  const fy = d.y - a.y
  const gx = a.x - b.x + c.x - d.x
  const gy = a.y - b.y + c.y - d.y
  const hx = point.x - a.x
  const hy = point.y - a.y

  // p = a + u*e + v*f + u*v*g. Eliminating u via cross product with e gives a
  // quadratic in v: k2*v^2 + k1*v + k0 = 0.
  const k2 = cross2(gx, gy, fx, fy)
  const k1 = cross2(ex, ey, fx, fy) + cross2(hx, hy, gx, gy)
  const k0 = cross2(hx, hy, ex, ey)

  function uFromV(v: number) {
    // After v is known, u solves (e + v*g)*u = h - v*f.
    const denomX = ex + gx * v
    const denomY = ey + gy * v
    return Math.abs(denomX) > Math.abs(denomY)
      ? (hx - fx * v) / denomX
      : (hy - fy * v) / denomY
  }

  function pickV(candidates: number[]) {
    const inside = candidates.find((value) => value >= -1e-6 && value <= 1 + 1e-6)
    return inside ?? candidates[0]
  }

  if (Math.abs(k2) < 1e-9) {
    if (Math.abs(k1) < 1e-9) {
      return { u: 0, v: 0 }
    }
    const v = -k0 / k1
    return { u: uFromV(v), v }
  }

  const discriminant = k1 * k1 - 4 * k0 * k2
  if (discriminant < 0) {
    const v = -k1 / (2 * k2)
    return { u: uFromV(v), v }
  }

  const sqrtDisc = Math.sqrt(discriminant)
  const v = pickV([(-k1 - sqrtDisc) / (2 * k2), (-k1 + sqrtDisc) / (2 * k2)])
  return { u: uFromV(v), v }
}

/**
 * Map an image pixel coordinate back to module-local millimeters using the
 * calibration corners. Coordinates outside the calibrated quadrilateral are
 * still returned (extrapolated) so the caller can decide how to handle them.
 */
export function imagePointToMm(
  calibration: PartImageCalibration,
  point: ImagePoint,
): MmPoint {
  const { u, v } = inverseBilinear(calibration.corners, point)
  return {
    xMm: u * calibration.widthMm,
    yMm: v * calibration.heightMm,
  }
}

/**
 * Generate `count` evenly spaced points in module-local millimeters between
 * `start` and `end` (inclusive). Used for the "click first pin / click last
 * pin / enter pin count" header-row helper.
 */
export function generatePinRowMm(start: MmPoint, end: MmPoint, count: number): MmPoint[] {
  const safeCount = Math.floor(count)
  if (safeCount < 1) {
    return []
  }
  if (safeCount === 1) {
    return [{ xMm: start.xMm, yMm: start.yMm }]
  }

  const points: MmPoint[] = []
  for (let index = 0; index < safeCount; index += 1) {
    const t = index / (safeCount - 1)
    points.push({
      xMm: start.xMm + (end.xMm - start.xMm) * t,
      yMm: start.yMm + (end.yMm - start.yMm) * t,
    })
  }
  return points
}

/** Distance between two mm points. */
export function distanceMm(a: MmPoint, b: MmPoint) {
  const dx = a.xMm - b.xMm
  const dy = a.yMm - b.yMm
  return Math.sqrt(dx * dx + dy * dy)
}

/** Clamp a value to the [0, 1] range. */
export function clampNormalized(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}
