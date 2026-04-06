import type { ActionFunctionArgs } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import { logoutPlatformUser } from '~/utils/platform-auth.server'
import { clearPlatformAuthState, getPlatformAuthState } from '~/utils/session.server'

export async function action({ request }: ActionFunctionArgs) {
  const authState = await getPlatformAuthState(request)
  if (authState?.refreshToken) {
    await logoutPlatformUser(authState.refreshToken)
  }

  return redirect('/login', {
    headers: {
      'Set-Cookie': await clearPlatformAuthState(request),
    },
  })
}
