import app from 'flarum/forum/app';

/** A count in the reader's own number format: 2,431 / 2.431 / 2 431. */
export default function formatCount(n: number): string {
  try {
    return new Intl.NumberFormat(app.translator.getLocale() || undefined).format(n);
  } catch (e) {
    return String(n);
  }
}
