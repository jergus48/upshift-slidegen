// Dealing random picks out of a shuffled bag instead of drawing each one
// independently.
//
// Independent draws clump. Ask for ten decks and a uniform pick over ten
// screenshots will happily use the same one five times and leave four unused —
// technically random, obviously stupid to look at. A dealer shuffles the pool
// into a bag and deals off it, only reshuffling once the bag runs dry, so
// everything available is used before anything is used twice.
//
// A dealer is therefore only worth anything if it OUTLIVES the individual pick:
// one is made per batch and shared by every deck in it (see
// lib/transformationDeck.ts).

export interface Dealer<T> {
  // The next card. `avoid` is a best-effort request not to hand back something
  // the caller already holds — it looks further into the bag, but gives up
  // rather than fail when the pool is too small to satisfy it.
  next(avoid?: T[]): T | undefined;
}

// Fisher-Yates, so every order is equally likely. `sort(() => Math.random() -
// 0.5)` is not a shuffle and biases badly on short arrays.
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function makeDealer<T>(items: T[]): Dealer<T> {
  let bag: T[] = [];
  const deal = (): T | undefined => {
    if (!items.length) return undefined;
    if (!bag.length) bag = shuffled(items);
    return bag.pop();
  };
  return {
    next(avoid: T[] = []) {
      let card = deal();
      // Bounded by the pool size: a pool of two asked for three distinct cards
      // has to repeat, and repeating beats handing back nothing.
      for (let tries = 0; card !== undefined && avoid.includes(card) && tries < items.length; tries++) {
        card = deal();
      }
      return card;
    },
  };
}

// A weighted bag: an entry appears as many times as its weight, so one full pass
// through the bag has exactly the intended mix AND still spreads — a weight-5
// entry cannot come up twice before the weight-1 entry has had its turn.
export function makeWeightedDealer<T>(items: T[], weightOf: (item: T) => number): Dealer<T> {
  return makeDealer(
    items.flatMap((item) => {
      const n = Math.max(1, Math.round(weightOf(item)));
      return Array.from({ length: n }, () => item);
    })
  );
}
