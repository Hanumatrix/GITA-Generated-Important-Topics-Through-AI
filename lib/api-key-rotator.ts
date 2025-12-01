/**
 * API Key Rotator - Manages multiple Google API keys and rotates them on rate limit errors
 * Falls back to next key when one is exhausted (429 status)
 */

interface APIKeyState {
  key: string;
  lastUsed: number;
  errorCount: number;
  isExhausted: boolean;
  exhaustedAt?: number;
}

class APIKeyRotator {
  private keys: APIKeyState[] = [];
  private currentIndex: number = 0;
  private readonly exhaustionCooldown = 3600000; // 1 hour in milliseconds

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys() {
    const baseKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const additionalKeys = [
      process.env.GOOGLE_GENERATIVE_AI_API_KEY_1,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY_2,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY_3,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY_4,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY_5,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY_6,
    ].filter(Boolean) as string[];

    const allKeys = baseKey ? [baseKey, ...additionalKeys] : additionalKeys;

    this.keys = allKeys.map((key) => ({
      key,
      lastUsed: 0,
      errorCount: 0,
      isExhausted: false,
    }));

    console.log(
      `[API Key Rotator] Initialized with ${this.keys.length} API keys`
    );
  }

  /**
   * Get the next available API key
   */
  public getNextKey(): string {
    const now = Date.now();

    // Check if any exhausted keys can be re-enabled
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      if (key.isExhausted && key.exhaustedAt) {
        if (now - key.exhaustedAt > this.exhaustionCooldown) {
          console.log(
            `[API Key Rotator] Re-enabling key ${i + 1} after cooldown period`
          );
          key.isExhausted = false;
          key.errorCount = 0;
          key.exhaustedAt = undefined;
        }
      }
    }

    // Find the next non-exhausted key
    let attempts = 0;
    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];

      if (!key.isExhausted) {
        key.lastUsed = now;
        console.log(
          `[API Key Rotator] Using key ${this.currentIndex + 1}/${this.keys.length}`
        );
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key.key;
      }

      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;
    }

    // Fallback: return first key if all are exhausted
    console.warn(
      "[API Key Rotator] All keys are exhausted, using first key anyway"
    );
    return this.keys[0].key;
  }

  /**
   * Mark a key as exhausted (rate limited)
   */
  public markKeyExhausted(key: string) {
    const keyIndex = this.keys.findIndex((k) => k.key === key);
    if (keyIndex !== -1) {
      this.keys[keyIndex].isExhausted = true;
      this.keys[keyIndex].exhaustedAt = Date.now();
      this.keys[keyIndex].errorCount++;

      console.warn(
        `[API Key Rotator] Key ${keyIndex + 1} marked as exhausted (attempt ${this.keys[keyIndex].errorCount})`
      );
    }
  }

  /**
   * Get current rotation status for debugging
   */
  public getStatus() {
    return {
      totalKeys: this.keys.length,
      currentIndex: this.currentIndex,
      keyStates: this.keys.map((k, i) => ({
        keyIndex: i + 1,
        isExhausted: k.isExhausted,
        errorCount: k.errorCount,
        lastUsed: new Date(k.lastUsed).toISOString(),
        exhaustedAt: k.exhaustedAt
          ? new Date(k.exhaustedAt).toISOString()
          : null,
      })),
    };
  }
}

// Singleton instance
let rotatorInstance: APIKeyRotator | null = null;

export function getAPIKeyRotator(): APIKeyRotator {
  if (!rotatorInstance) {
    rotatorInstance = new APIKeyRotator();
  }
  return rotatorInstance;
}

export function getNextAPIKey(): string {
  const key = getAPIKeyRotator().getNextKey();
  // Set the environment variable so @ai-sdk/google uses the correct key
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;
  return key;
}

export function markAPIKeyExhausted(key: string): void {
  return getAPIKeyRotator().markKeyExhausted(key);
}

export function getRotatorStatus() {
  return getAPIKeyRotator().getStatus();
}
