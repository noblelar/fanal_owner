import { json } from '@remix-run/node'
import { getBuildInformation } from '~/utils/build-info.server'

export function loader() {
  return json(getBuildInformation(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
