/**
 * Престиж — «Перековка Души»: сброс прогресса за постоянный множитель.
 */
import { SOUL_GOLD_THRESHOLD, SOUL_BONUS } from './config';

/** Сколько душ даст текущее lifetime-золото (кумулятивно) */
export function soulsForLifetimeGold(lifetimeGold: number): number {
  return Math.floor(Math.sqrt(lifetimeGold / SOUL_GOLD_THRESHOLD));
}

/** Сколько новых душ игрок получит при престиже прямо сейчас */
export function pendingSouls(lifetimeGold: number, currentSouls: number): number {
  return Math.max(0, soulsForLifetimeGold(lifetimeGold) - currentSouls);
}

/** Постоянный множитель от душ: +10% за душу (и к доходу, и к ДПС) */
export function prestigeMultiplier(souls: number): number {
  return 1 + SOUL_BONUS * souls;
}
