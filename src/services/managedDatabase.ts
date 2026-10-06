/** Explicit ownership keeps regeneration away from the user's other content.
 * Only old cards carrying our lp-sr-word class can be safely adopted. Plain
 * #word cards belong to the user/other plugins and remain outside our region. */
export function replaceManagedSection(text: string, kind: 'review' | 'words', body: string): string {
  const start = `<!-- langplayer:${kind}:start -->`;
  const end = `<!-- langplayer:${kind}:end -->`;
  const section = `${start}\n${body.trimEnd()}\n${end}`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a >= 0 || b >= 0) {
    if (a < 0 || b < a || text.indexOf(start, a + start.length) >= 0 || text.indexOf(end, b + end.length) >= 0) {
      throw new Error('Invalid Dashell Player database markers; original content preserved');
    }
    return text.slice(0, a) + section + text.slice(b + end.length);
  }
  return text + (text.endsWith('\n\n') || !text ? '' : text.endsWith('\n') ? '\n' : '\n\n') + section + '\n';
}

function decodeHtml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"})[entity]!);
}

export function reviewBlocks(text: string): {word: string; sr?: string; owned: boolean}[] {
  return text.split(/(?=^#word\r?$|^<!-- langplayer:review:end -->)/m).flatMap(block => {
    const heading = /^#word\r?\n#### ([^\r\n]+)\r?\n\?\r?\n/m.exec(block);
    if (!heading) return [];
    const html = /<span class="lp-sr-word" data-word="([^"]*)">/.exec(heading[1]!);
    return [{word: html ? decodeHtml(html[1]!) : heading[1]!.trim(), owned: !!html,
      sr: /<!--SR:[\s\S]*?-->/.exec(block)?.[0]}];
  });
}

export function removeLegacyOwnedCards(text: string): string {
  return transformOwnedCards(text, () => '');
}
export function transformOwnedCards(text: string, transform: (block: string) => string): string {
  return text.replace(/^#word\r?\n#### <span class="lp-sr-word" data-word="[^"]*">[^\r\n]*\r?\n\?\r?\n[^\r\n]*(?:\r?\n\*\*Sentences\*\*:\r?\n\*[^\r\n]*\*(?:\r?\n(?!#word|<!--|####)[^\r\n]+){0,2})?(?:\r?\n<!--SR:[\s\S]*?-->)?(?:\r?\n|$)/gm, transform);
}
