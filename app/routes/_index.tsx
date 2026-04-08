import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import { buildFanalMeta } from '~/utils/site-meta'
import { getPlatformAuthState } from '~/utils/session.server'

export const meta: MetaFunction = () => buildFanalMeta()

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await getPlatformAuthState(request)
  throw redirect(authState ? '/dashboard' : '/login')
}

export default function Index() {
  return null
}
