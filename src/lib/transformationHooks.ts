// Hook lines for the before/after transformation decks (see lib/characters.ts
// and views/CharactersView.tsx). These are copied verbatim from what actually
// performs — do NOT "improve" the wording, the typos and spacing are on purpose.
//
// Two tokens get substituted with the deck's randomly-picked streak:
//   {X} → the plain duration  ("1 year", "90 days")
//   {A} → the same duration with an article ("a year", "90 days")
// A template with no token is used as-is.

export const HOOKS: string[] = [
  'The goon effect',
  'The  g00n effect',
  'POV you finally quit 🌽',
  'The lust effect',
  'The clav effect',
  'The p*rn effect',
  'what {X} of no lust does to a man',
  'wtf happened to my face after quitting 🌽',
  'POV: God told you to quit lust for {A}....',
  'wtf happened to my face after quitting lust',
  'POV: you actually lockin and quit lust for {X}',
  'What {X} of no lust actually does to a man...',
  'I quit lust for {X}....but It costed everything',
  'POV: You listen to God and quit lust for {X}',
  'What 1 year of no lust lowkenuinely does to a man...',
  'My grandpa told me quitting lust will unlock infinite women....',
  'POV: God told you to quit lust',
  'What quitting 🌽 does to your face',
  'How I went from 🌽addict to married in 1 year',
  'My mom caught me g00ning at 2am...',
  'POV: Your triple your test in {X} (I quit 🌽)',
  'Watching p*rn 17x per day vs....',
  'Watching 🌽  17x per day vs....',
  'Watching p*rn 12x per day vs....',
  'Watching 🌽 9x per day vs....',
  'Watching 🌽 5x per day vs....',
  'Watching 🌽 7x per day vs....',
  'Watching 🌽67x per day vs....',
  'Watching 🌽 3x per day vs....',
  'Watching 🌽daily vs....',
  '"gooning is cope"',
];

// Fill a hook template with one streak. Templates with no token come back
// unchanged, which is why the fixed-duration hooks above stay literal.
export function fillHook(template: string, streak: { label: string; article: string }): string {
  return template.replace(/\{X\}/g, streak.label).replace(/\{A\}/g, streak.article);
}

// Does this hook actually reference the streak? Used by the view to show which
// lines change with the picked duration.
export function hookUsesStreak(template: string): boolean {
  return /\{X\}|\{A\}/.test(template);
}
