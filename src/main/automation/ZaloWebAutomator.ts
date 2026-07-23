export const ZALO_TEST_SEARCH_TERM = 'Dương' as const

export function normalizeZaloMessage(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
}
