import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";

export const SESSION_PREFIX = "spira:";
const LOGIN_ATTEMPT_PREFIX = "spira:login-attempts:";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.client = createClient({ url: redisUrl });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Removes every session belonging to a user. Spira has exactly one account,
   * so this is called on login to keep a single active session.
   */
  async clearSessionsForUser(userId: string): Promise<void> {
    const keys = await this.client.keys(`${SESSION_PREFIX}*`);
    for (const key of keys) {
      try {
        const value = await this.client.get(key);
        if (value) {
          const session = JSON.parse(value) as { userId?: string };
          if (session.userId === userId) {
            await this.client.del(key);
          }
        }
      } catch {
        // Skip malformed entries
      }
    }
  }

  /**
   * Login attempt counter, keyed by IP. Returns the attempt count after
   * incrementing. The window is refreshed on every failure, so a client that
   * keeps trying stays locked out until it stops for the full window.
   */
  async recordFailedLogin(ip: string, windowSeconds: number): Promise<number> {
    const key = `${LOGIN_ATTEMPT_PREFIX}${ip}`;
    const attempts = await this.client.incr(key);
    await this.client.expire(key, windowSeconds);
    return attempts;
  }

  /**
   * Lengthens the lockout window without touching the counter. Separate from
   * `recordFailedLogin` because that one INCRs: calling it again to widen the
   * window would count the same failure twice and make the backoff escalate at
   * roughly double the intended rate.
   */
  async extendFailedLoginWindow(ip: string, windowSeconds: number): Promise<void> {
    await this.client.expire(`${LOGIN_ATTEMPT_PREFIX}${ip}`, windowSeconds);
  }

  async getFailedLogins(ip: string): Promise<number> {
    const value = await this.client.get(`${LOGIN_ATTEMPT_PREFIX}${ip}`);
    return value ? parseInt(value, 10) : 0;
  }

  async clearFailedLogins(ip: string): Promise<void> {
    await this.client.del(`${LOGIN_ATTEMPT_PREFIX}${ip}`);
  }
}
