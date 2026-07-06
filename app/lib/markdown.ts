import { defaultSchema } from 'rehype-sanitize'

const defaultTagNames = defaultSchema.tagNames ?? []
const defaultAttributes = defaultSchema.attributes ?? {}
const defaultProtocols = defaultSchema.protocols ?? {}

export const sanitizedMarkdownSchema = {
  ...defaultSchema,
  tagNames: [...defaultTagNames, 'details', 'summary', 'div'],
  attributes: {
    ...defaultAttributes,
    a: [...(defaultAttributes.a ?? []), 'name'],
    div: [...(defaultAttributes.div ?? []), 'align'],
    img: [...(defaultAttributes.img ?? []), 'width', 'height'],
    details: [...(defaultAttributes.details ?? []), 'open'],
    summary: [...(defaultAttributes.summary ?? [])],
  },
  protocols: {
    ...defaultProtocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
    cite: ['http', 'https'],
    longDesc: ['http', 'https'],
  },
}
