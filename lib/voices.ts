// The four cooked.ai voices (safe to import in client code).
export const STYLE_EMOJI: Record<string, string> = {
  "Chronically Online": "\u{1F480}",
  "Midwest Mom": "\u{1F33D}",
  "Real New Yorker": "\u{1F5FD}",
  "Columbia Tour Guide": "\u{1F981}",
};

export const VOICE_NAMES = Object.keys(STYLE_EMOJI);

// Chart colors, in the same fixed order as the voices (colorblind-checked).
export const VOICE_COLOR: Record<string, string> = Object.fromEntries(VOICE_NAMES.map((v, i) => [v, `var(--series-${i + 1})`]));
