/**
 * Обёртка Яндекс.Игры SDK v2.
 * В дев-режиме или при недоступности SDK работает mock-заглушка,
 * чтобы игра была полностью играбельна и вне платформы.
 */

declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<YaSdk>;
    };
  }
}

interface YaPlayer {
  getData: (keys?: string[]) => Promise<Record<string, unknown>>;
  setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
  getName: () => string | null;
}

interface YaSdk {
  getPlayer: (opts?: { scopes?: boolean }) => Promise<YaPlayer>;
  adv: {
    showFullscreenAdv: (opts?: {
      callbacks?: { onClose?: () => void; onError?: (e: unknown) => void };
    }) => void;
    showRewardedVideo: (opts?: {
      callbacks?: {
        onRewarded?: () => void;
        onClose?: () => void;
        onError?: (e: unknown) => void;
      };
    }) => void;
  };
  getLeaderboards?: () => Promise<{
    setLeaderboardScore: (name: string, score: number) => Promise<void>;
  }>;
  features?: { LoadingAPI?: { ready: () => void } };
}

class YandexPlatform {
  private sdk: YaSdk | null = null;
  private player: YaPlayer | null = null;
  /** true, если настоящий SDK подключён */
  live = false;

  async init(): Promise<void> {
    try {
      if (!window.YaGames) {
        console.info('[YaGames] SDK не найден — дев-режим');
        return;
      }
      this.sdk = await window.YaGames.init();
      this.player = await this.sdk.getPlayer({ scopes: false });
      this.live = true;
      this.sdk.features?.LoadingAPI?.ready();
      console.info('[YaGames] SDK инициализирован');
    } catch (e) {
      console.warn('[YaGames] init failed, fallback to mock', e);
      this.sdk = null;
      this.player = null;
    }
  }

  /** Загрузка облачного сейва (ключ save) */
  async cloudLoad(): Promise<unknown | null> {
    if (!this.player) return null;
    try {
      const data = await this.player.getData(['save']);
      return data?.save ?? null;
    } catch (e) {
      console.warn('[YaGames] cloudLoad failed', e);
      return null;
    }
  }

  async cloudSave(save: unknown): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.setData({ save }, true);
    } catch (e) {
      console.warn('[YaGames] cloudSave failed', e);
    }
  }

  /** Rewarded-реклама; resolve(true) если награда получена */
  showRewarded(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.sdk) {
        // дев-режим: награда сразу
        console.info('[YaGames mock] rewarded → награда выдана');
        resolve(true);
        return;
      }
      let rewarded = false;
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => resolve(rewarded),
          onError: () => resolve(false),
        },
      });
    });
  }

  /** Interstitial-реклама; resolve по закрытию */
  showInterstitial(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.sdk) {
        resolve();
        return;
      }
      this.sdk.adv.showFullscreenAdv({
        callbacks: { onClose: () => resolve(), onError: () => resolve() },
      });
    });
  }

  async submitLeaderboard(score: number): Promise<void> {
    if (!this.sdk?.getLeaderboards) return;
    try {
      const lb = await this.sdk.getLeaderboards();
      await lb.setLeaderboardScore('gold', Math.floor(score));
    } catch (e) {
      console.warn('[YaGames] leaderboard failed', e);
    }
  }

  getPlayerName(): string {
    return this.player?.getName() ?? 'Кузнец';
  }
}

export const ya = new YandexPlatform();
