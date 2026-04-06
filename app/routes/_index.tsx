import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import { getPlatformAuthState } from '~/utils/session.server'

export const meta: MetaFunction = () => {
  return [
    { title: 'Fanal Owner' },
    { name: 'description', content: 'Platform operations console for Fanal.' },
  ]
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await getPlatformAuthState(request)
  throw redirect(authState ? '/dashboard' : '/login')
}

export default function Index() {
  return null
}
