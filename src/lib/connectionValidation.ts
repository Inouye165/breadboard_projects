/**
 * Generic, data-driven connection validation for the breadboard project.
 *
 * The engine is module-agnostic. It looks at the metadata stored on every
 * `LogicalPin.electrical` (role / direction / voltage / capabilities), walks
 * the breadboard's electrical connectivity (region row/column groups + all
 * existing wires, plus an optional candidate wire being created), and runs
 * a fixed set of generic rules. No rule asks "is this an ESP32?" \u2014 if a
 * rule fails, it's because the metadata of the pins on the affected nets
 * actually conflict.
 *
 * Callers typically want either:\n *   - `validateCandidateWire(...)` before adding a wire (block on errors,\n *     warn-but-allow on warnings), or\n *   - `validateProjectWiring(...)` to run the rules across the whole\n *     project's existing nets.
 */

import type { BreadboardDefinition } from './breadboardDefinitionModel'
import type { BreadboardProject, Wire } from './breadboardProjectModel'
import {
  ALIGNMENT_THRESHOLD_MM,
  computeAlignedBreadboardPinIds,
  computeElectricalGroups,
  getInstanceSnapPointsWorld,
} from './modulePinAlignment'
import type { LibraryPartDefinition } from './partLibraryModel'
import {
  coerceDirection,
  coerceRole,
  type PinElectricalRole,
  type PinDirection,
  type PinElectricalMetadata,
} from './pinElectrical'

export type ValidationSeverity = 'error' | 'warning' | 'info'

export type ValidationFinding = {
  /** Unique rule identifier, e.g. 'POWER_GROUND_SHORT'. */
  ruleId: string
  severity: ValidationSeverity
  message: string
  /** Breadboard pin IDs participating in the affected net(s). */
  involvedPinIds: string[]
  /** Logical pin IDs participating in the violation, when known. */
  involvedLogicalPinIds?: string[]
}

export type AttachedLogicalPin = {
  partId: string
  partName: string
  logicalPinId: string
  pinName: string
  electrical: PinElectricalMetadata
}

export type ValidationContext = {
  project: BreadboardProject
  breadboard: BreadboardDefinition
  libraryPartIndex: Map<string, LibraryPartDefinition>
  pixelsPerMm: number
}

const DEFAULT_ELECTRICAL: PinElectricalMetadata = Object.freeze({}) as PinElectricalMetadata

function isPowerRole(role: PinElectricalRole) {
  return role === 'power'
}

function isGroundRole(role: PinElectricalRole) {
  return role === 'ground'
}

function isSignalish(role: PinElectricalRole) {
  return (
    role === 'signal' ||
    role === 'analog' ||
    role === 'digital' ||
    role === 'communication-bus' ||
    role === 'reset-boot-control'
  )
}

function isPushPullOutput(direction: PinDirection, electrical: PinElectricalMetadata) {
  if (direction !== 'output') {
    return false
  }
  const caps = electrical.capabilities ?? []
  return !caps.includes('OPEN_DRAIN') && !caps.includes('OPEN_COLLECTOR')
}

/**
 * Build a map: breadboard pin id -> list of logical pins attached to that
 * breadboard pin (via module alignment). Threshold matches the live
 * snapping threshold so the validator agrees with what the user sees.
 */
export function buildAttachedLogicalPinIndex(
  context: ValidationContext,
): Map<string, AttachedLogicalPin[]> {
  const { project, breadboard, libraryPartIndex, pixelsPerMm } = context
  const index = new Map<string, AttachedLogicalPin[]>()
  const modules = project.modules ?? []

  if (modules.length === 0 || pixelsPerMm <= 0) {
    return index
  }

  // Reuse the same alignment math as the renderer so results match what
  // the user sees on the canvas.
  for (const instance of modules) {
    const part = libraryPartIndex.get(instance.libraryPartId)
    if (!part) continue

    // For each module pin, find the closest breadboard pin within threshold.
    // We can't use the bulk helper because we also need the logical mapping.
    const singleModuleIndex = new Map<string, LibraryPartDefinition>([[part.id, part]])
    const aligned = computeAlignedBreadboardPinIds(
      [instance],
      singleModuleIndex,
      breadboard.points,
      pixelsPerMm,
    )

    if (aligned.size === 0) continue

    const thresholdSqPx = (ALIGNMENT_THRESHOLD_MM * pixelsPerMm) ** 2

    for (const snap of getInstanceSnapPointsWorld(instance, part, pixelsPerMm)) {
      let bestPinId: string | null = null
      let bestDistSq = thresholdSqPx
      for (const boardPt of breadboard.points) {
        const distSq = (boardPt.x - snap.x) ** 2 + (boardPt.y - snap.y) ** 2
        if (distSq <= bestDistSq) {
          bestDistSq = distSq
          bestPinId = boardPt.id
        }
      }

      if (!bestPinId) continue

      const logicalPin = snap.point.logicalPinId
        ? part.logicalPins.find((p) => p.id === snap.point.logicalPinId)
        : undefined

      if (!logicalPin) {
        // Unknown logical mapping \u2014 still record an attachment so unknown
        // metadata can produce a warning.
        const list = index.get(bestPinId) ?? []
        list.push({
          partId: part.id,
          partName: part.name,
          logicalPinId: snap.point.id,
          pinName: snap.point.label ?? '(unlabeled pad)',
          electrical: DEFAULT_ELECTRICAL,
        })
        index.set(bestPinId, list)
        continue
      }

      const list = index.get(bestPinId) ?? []
      list.push({
        partId: part.id,
        partName: part.name,
        logicalPinId: logicalPin.id,
        pinName: logicalPin.name,
        electrical: logicalPin.electrical ?? DEFAULT_ELECTRICAL,
      })
      index.set(bestPinId, list)
    }
  }

  return index
}

/**
 * Public helper: list every logical pin attached to a given breadboard pin
 * (or net of pins). Useful for tooltips and net inspectors.
 */
export function getAttachedLogicalPins(
  pinIds: Iterable<string>,
  attachedIndex: Map<string, AttachedLogicalPin[]>,
): AttachedLogicalPin[] {
  const out: AttachedLogicalPin[] = []
  for (const pinId of pinIds) {
    const entries = attachedIndex.get(pinId)
    if (entries) out.push(...entries)
  }
  return out
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Run all generic rules against a single net (set of breadboard pin IDs)
 * given the logical pins attached to that net. Returns 0..N findings.
 */
export function evaluateNet(
  netPinIds: Set<string>,
  attached: AttachedLogicalPin[],
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const involvedPinIds = [...netPinIds]

  if (attached.length === 0) {
    return findings
  }

  const roles = attached.map((a) => coerceRole(a.electrical.role))
  const directions = attached.map((a) => coerceDirection(a.electrical.direction))

  const hasPower = roles.some(isPowerRole)
  const hasGround = roles.some(isGroundRole)
  const hasNoConnect = roles.some((r) => r === 'no-connect')
  const hasUnknownRole = roles.some((r) => r === 'unknown')

  // Rule: power-to-ground short.
  if (hasPower && hasGround) {
    findings.push({
      ruleId: 'POWER_GROUND_SHORT',
      severity: 'error',
      message: 'Blocked: this would short power to ground.',
      involvedPinIds,
      involvedLogicalPinIds: attached.map((a) => a.logicalPinId),
    })
  }

  // Rule: voltage / power-domain mismatch on power nets.
  // Find power suppliers (power-output / power) and power consumers
  // (power-input). If a 5V supplier sits on a net with a 3.3V-only consumer,
  // that's an error unless the consumer accepts 5V.
  const powerSuppliers = attached.filter(
    (a, i) => isPowerRole(roles[i]) && (directions[i] === 'power-output' || directions[i] === 'unknown'),
  )
  const powerConsumers = attached.filter(
    (a, i) => isPowerRole(roles[i]) && directions[i] === 'power-input',
  )

  for (const supplier of powerSuppliers) {
    const supplierV =
      supplier.electrical.voltageDomain?.nominalV ?? supplier.electrical.voltageDomain?.maxV
    if (typeof supplierV !== 'number') continue
    for (const consumer of powerConsumers) {
      const v = consumer.electrical.voltageDomain
      if (!v) continue
      const accepts =
        (typeof v.minV === 'number' ? supplierV >= v.minV : true) &&
        (typeof v.maxV === 'number' ? supplierV <= v.maxV : true)
      if (!accepts) {
        findings.push({
          ruleId: 'POWER_DOMAIN_MISMATCH',
          severity: 'error',
          message: `Blocked: ${supplierV}V supply connected to ${consumer.partName}.${consumer.pinName} which expects ${v.minV ?? '?'}\u2013${v.maxV ?? v.nominalV ?? '?'}V.`,
          involvedPinIds,
          involvedLogicalPinIds: [supplier.logicalPinId, consumer.logicalPinId],
        })
      }
    }
  }

  // Rule: 5V on a 3.3V-only signal pin (unless 5V tolerant).
  // Determine the highest power-supplier voltage on this net.
  const netSupplyV = powerSuppliers
    .map((s) => s.electrical.voltageDomain?.nominalV ?? s.electrical.voltageDomain?.maxV)
    .filter((v): v is number => typeof v === 'number')
    .reduce<number | undefined>((max, v) => (max === undefined || v > max ? v : max), undefined)

  if (typeof netSupplyV === 'number' && netSupplyV > 3.5) {
    for (let i = 0; i < attached.length; i += 1) {
      const a = attached[i]
      if (!isSignalish(roles[i])) continue
      const v = a.electrical.voltageDomain
      const tolerant = v?.fiveVTolerant
      const logic = v?.logicLevelV
      if (tolerant === 'yes') continue
      if (typeof logic === 'number' && logic >= netSupplyV - 0.1) continue
      // Logic is 3.3V (or unspecified-but-not-5V-tolerant) \u2014 block.
      if (typeof logic === 'number' && logic < netSupplyV - 0.1) {
        findings.push({
          ruleId: 'OVER_VOLTAGE_SIGNAL',
          severity: 'error',
          message: `Blocked: ${netSupplyV}V cannot be connected directly to ${a.partName}.${a.pinName} (${logic}V logic, not 5V tolerant).`,
          involvedPinIds,
          involvedLogicalPinIds: [a.logicalPinId],
        })
      }
    }
  }

  // Rule: signal pin connected directly to a power rail (sensor OUT \u2192 5V).
  if (hasPower) {
    for (let i = 0; i < attached.length; i += 1) {
      if (!isSignalish(roles[i])) continue
      const a = attached[i]
      // If the signal is also explicitly 5V tolerant AND we already produced a
      // POWER_GROUND_SHORT, prefer just one finding. Always emit a warning
      // here so the user sees that data lines should not sit on the rail.
      findings.push({
        ruleId: 'SIGNAL_ON_POWER_RAIL',
        severity: 'warning',
        message: `Warning: ${a.partName}.${a.pinName} is a signal pin tied directly to a power rail.`,
        involvedPinIds,
        involvedLogicalPinIds: [a.logicalPinId],
      })
      break // one warning per net is enough
    }
  }

  // Rule: output-to-output conflict (push-pull).
  const pushPullOutputs = attached.filter((a, i) => isPushPullOutput(directions[i], a.electrical))
  if (pushPullOutputs.length > 1) {
    findings.push({
      ruleId: 'OUTPUT_OUTPUT_CONFLICT',
      severity: 'warning',
      message: `Warning: ${pushPullOutputs.length} push-pull outputs are tied together (${pushPullOutputs.map((p) => `${p.partName}.${p.pinName}`).join(', ')}).`,
      involvedPinIds,
      involvedLogicalPinIds: pushPullOutputs.map((p) => p.logicalPinId),
    })
  }

  // Rule: no-connect pin in net with anything else.
  if (hasNoConnect && attached.length > 1) {
    const nc = attached.find((_a, i) => roles[i] === 'no-connect')!
    findings.push({
      ruleId: 'NO_CONNECT_USED',
      severity: 'error',
      message: `Blocked: ${nc.partName}.${nc.pinName} is marked no-connect and must be left floating.`,
      involvedPinIds,
      involvedLogicalPinIds: [nc.logicalPinId],
    })
  }

  // Rule: unknown metadata \u2014 warn instead of giving a false safe answer.
  if (hasUnknownRole && findings.length === 0) {
    const unknownPin = attached.find((_a, i) => roles[i] === 'unknown')!
    findings.push({
      ruleId: 'UNKNOWN_METADATA',
      severity: 'warning',
      message: `Warning: ${unknownPin.partName}.${unknownPin.pinName} role is unknown; cannot fully validate this connection.`,
      involvedPinIds,
      involvedLogicalPinIds: [unknownPin.logicalPinId],
    })
  }

  return findings
}

/**
 * Run validation across the whole project. Each connected net is evaluated
 * independently. Returns one merged list of findings (sorted by severity).
 */
export function validateProjectWiring(
  context: ValidationContext,
  options: { extraWires?: Wire[] } = {},
): ValidationFinding[] {
  const wires = options.extraWires
    ? [...context.project.wires, ...options.extraWires]
    : context.project.wires
  const groups = computeElectricalGroups(context.breadboard, wires)
  const attachedIndex = buildAttachedLogicalPinIndex(context)

  const findings: ValidationFinding[] = []
  for (const group of groups) {
    const attached = getAttachedLogicalPins(group, attachedIndex)
    if (attached.length === 0) continue
    findings.push(...evaluateNet(group, attached))
  }
  return sortFindings(findings)
}

/**
 * Validate a single candidate wire (the user is about to create it). Only
 * findings affecting the net the new wire would create/extend are returned.
 */
export function validateCandidateWire(
  context: ValidationContext,
  candidate: { fromPointId: string; toPointId: string },
): ValidationFinding[] {
  if (candidate.fromPointId === candidate.toPointId) {
    return [
      {
        ruleId: 'SELF_WIRE',
        severity: 'error',
        message: 'Blocked: a wire must connect two different pins.',
        involvedPinIds: [candidate.fromPointId],
      },
    ]
  }

  const phantom: Wire = {
    id: '__candidate__',
    fromPointId: candidate.fromPointId,
    toPointId: candidate.toPointId,
  }
  const allWires = [...context.project.wires, phantom]
  const groups = computeElectricalGroups(context.breadboard, allWires)
  const attachedIndex = buildAttachedLogicalPinIndex(context)

  const affected = groups.find(
    (g) => g.has(candidate.fromPointId) || g.has(candidate.toPointId),
  )

  if (!affected) {
    return []
  }

  const attached = getAttachedLogicalPins(affected, attachedIndex)
  return sortFindings(evaluateNet(affected, attached))
}

function severityRank(s: ValidationSeverity) {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2
}

function sortFindings(findings: ValidationFinding[]) {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
}
