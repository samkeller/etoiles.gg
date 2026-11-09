/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.win ★ Logger minimal
 * ──────────────────────────────────────────────────────────────
 *  LOG_LEVEL=silent|info (défaut : info). Des étapes qui ouvrent
 *  et ferment la boucle : ── 1. titre ──… ✓ 1. titre.
 * ═════════════════════════════════════════════════════════════════
 */

const LEVELS = { silent: 0, info: 1 } as const;
const level = LEVELS[(process.env.LOG_LEVEL as keyof typeof LEVELS) ?? 'info'] ?? LEVELS.info;
const timestamp = () => `[${new Date().toISOString()}]`;

export const log = {
  info: (msg: string) => { if (level >= 1) console.log(`${timestamp()} ${msg}`); },
  error: (msg: string) => { console.error(`${timestamp()} ✗ ${msg}`); },

  /** Ouvre une étape numérotée */
  step: (n: number, title: string) => {
    if (level >= 1) console.log(`\n${timestamp()} ── ${n}. ${title} ${'─'.repeat(Math.max(2, 58 - title.length - String(n).length))}`);
  },

  /** Ferme une étape avec un bilan en une ligne */
  done: (n: number, title: string, result: string) => {
    if (level >= 1) console.log(`${timestamp()} ✓ ${n}. ${title} — ${result}`);
  },
};