import type { Scenario } from '../../types';

const escape = (value: string) => value.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!));

/** A labeled sample image of the backend's fixture text, never a camera preview. */
export function sampleScene(scenario: Scenario): string {
  const signs = scenario.regions.map(region => {
    const { x, y, width, height } = region.bbox;
    const size = region.text.includes('EXIT') ? 78 : 28;
    const maxChars = Math.max(12, Math.floor(width * 1000 / (size * .55)));
    const lines = region.text.split('\n').flatMap(line => {
      const words = line.split(' ');
      const wrapped: string[] = [];
      let current = '';
      words.forEach(word => {
        if (current && current.length + word.length + 1 > maxChars) { wrapped.push(current); current = ''; }
        current += `${current ? ' ' : ''}${word}`;
      });
      if (current) wrapped.push(current);
      return wrapped;
    });
    const signX = x * 1000, signY = y * 625, signW = width * 1000, signH = height * 625;
    return `<g><rect x="${signX + 4}" y="${signY + 6}" width="${signW}" height="${signH}" fill="#10110f" opacity=".25"/>
      <rect x="${signX}" y="${signY}" width="${signW}" height="${signH}" rx="2" fill="${size === 78 ? '#252823' : '#d8d5cb'}" stroke="${size === 78 ? '#c3c5b9' : '#bab8ae'}"/>
      ${lines.map((line, index) => `<text x="${signX + 24}" y="${signY + signH / 2 + (index - (lines.length - 1) / 2) * size * 1.3}" dominant-baseline="central" font-family="Arial, sans-serif" font-size="${size}" font-weight="${size === 78 ? 600 : 400}" fill="${size === 78 ? '#f0efe5' : '#242520'}">${escape(line)}</text>`).join('')}</g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="625" viewBox="0 0 1000 625">
    <defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#74756d"/><stop offset="1" stop-color="#464940"/></linearGradient><linearGradient id="door"><stop stop-color="#242721"/><stop offset="1" stop-color="#151712"/></linearGradient></defs>
    <rect width="1000" height="625" fill="url(#wall)"/>
    <path d="M780 0H1000V625H780Z" fill="#35382f"/><path d="M804 0H965V625H804Z" fill="url(#door)"/>
    <path d="M0 575H780L804 625H0Z" fill="#3b3e35"/><path d="M0 310H780M390 0V575M0 574H780" fill="none" stroke="#959589" stroke-opacity=".17"/>
    <path d="M790 0V625M975 0V625" stroke="#acac98" stroke-opacity=".25"/>
    ${signs}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
