export function resolveTrustedComponentSelection(catalog, component, reference) {
  if (reference === 'stable') {
    return catalog.stable?.manifest.components[component] ?? null
  }

  const match = /^artifact:(\d+)$/.exec(reference)
  if (!match) return null
  const artifactId = Number(match[1])
  const candidate = catalog.components[component].candidates.find(
    (entry) => entry.artifactId === artifactId
  )
  return candidate
    ? { image: candidate.image, revision: candidate.revision, version: candidate.version }
    : null
}

export function findActivePlatformOperation(history) {
  return history.find((item) => item.status !== 'completed') ?? null
}
