export type ScreenPointCandidate<T> = {
  value: T
  x: number
  y: number
  radius: number
}

export function pickClosestScreenPoint<T>(
  candidates: readonly ScreenPointCandidate<T>[],
  x: number,
  y: number,
): T | undefined {
  let closest: T | undefined
  let closestDistanceSquared = Infinity
  for (const candidate of candidates) {
    const distanceSquared = (candidate.x - x) ** 2 + (candidate.y - y) ** 2
    if (distanceSquared > candidate.radius ** 2 || distanceSquared >= closestDistanceSquared) continue
    closest = candidate.value
    closestDistanceSquared = distanceSquared
  }
  return closest
}
