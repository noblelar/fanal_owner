import type { MetaDescriptor } from '@remix-run/node'

export const FANAL_SITE_TITLE = 'Fanal'
export const FANAL_SITE_DESCRIPTION = 'Customisable educational platform for schools'

export function buildFanalMeta(
  pageTitle?: string,
  description: string = FANAL_SITE_DESCRIPTION
): MetaDescriptor[] {
  return [
    { title: pageTitle ? `${pageTitle} | ${FANAL_SITE_TITLE}` : FANAL_SITE_TITLE },
    { name: 'description', content: description },
  ]
}
