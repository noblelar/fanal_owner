import packageMetadata from '../../package.json'

export type BuildInformation = {
  component: 'fanal-owner'
  version: string
  revision: string
}

function readBuildValue(value: string | undefined, fallback: string) {
  const normalizedValue = value?.trim()
  return normalizedValue || fallback
}

export function getBuildInformation(): BuildInformation {
  return {
    component: 'fanal-owner',
    version: readBuildValue(process.env.APP_VERSION, packageMetadata.version),
    revision: readBuildValue(process.env.GIT_SHA, 'unknown'),
  }
}
