const root = 'https://github.com/sepa79/PocketHive/blob/main/docs'
const pages = {
  templates: 'https://github.com/sepa79/PocketHive/blob/2dd092f9690854cc9dbcd7cc606eaa698f9ac1af/docs/contracts/portable-http-templates.md',
  variables: `${root}/scenarios/SCENARIO_VARIABLES.md`,
}

export function PhDocs({ page, children }: { page: keyof typeof pages; children: string }) {
  return <a href={pages[page]} target="_blank" rel="noopener noreferrer">{children} ↗</a>
}
