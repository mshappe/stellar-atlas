export function cameraDistanceForViewRadius(
  radiusParsecs: number,
  verticalFieldOfViewDegrees: number,
  aspectRatio: number,
) {
  return radiusParsecs / (
    Math.tan(verticalFieldOfViewDegrees * Math.PI / 360)
    * Math.min(1, aspectRatio)
  )
}
