import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { KvLike } from "./watchlist.js";

export const SETTINGS_READ_TOOL = "nooticr_settings_read";
export const SETTINGS_UPDATE_TOOL = "nooticr_settings_update";

export const DEFAULT_SOCIAL_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "twitter",
  "reddit",
  "douyin",
  "xiaohongshu",
  "weibo",
  "bilibili",
] as const;

export interface NooticrSettings {
  defaultSocialPlatform: (typeof DEFAULT_SOCIAL_PLATFORMS)[number];
  defaultResultCount: number;
}

export const DEFAULT_NOOTICR_SETTINGS: NooticrSettings = {
  defaultSocialPlatform: "tiktok",
  // Keep existing tool behaviour until the user chooses another count.
  defaultResultCount: 12,
};

export interface SettingsStore {
  get(owner: string): Promise<NooticrSettings | undefined>;
  put(owner: string, value: NooticrSettings): Promise<void>;
}

export class MemorySettingsStore implements SettingsStore {
  private readonly values = new Map<string, NooticrSettings>();

  async get(owner: string) {
    const value = this.values.get(owner);
    return value ? { ...value } : undefined;
  }

  async put(owner: string, value: NooticrSettings) {
    this.values.set(owner, { ...value });
  }
}

/** Durable account-scoped preferences for the Cloudflare-hosted MCP server. */
export class KvSettingsStore implements SettingsStore {
  constructor(private readonly kv: KvLike) {}

  private key(owner: string) {
    return `plugin-settings:${owner}`;
  }

  async get(owner: string): Promise<NooticrSettings | undefined> {
    const raw = await this.kv.get(this.key(owner));
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as Partial<NooticrSettings>;
      const platform = DEFAULT_SOCIAL_PLATFORMS.find((candidate) => candidate === parsed.defaultSocialPlatform);
      const count = parsed.defaultResultCount;
      if (!platform || !Number.isInteger(count) || count! < 3 || count! > 12) return undefined;
      return { defaultSocialPlatform: platform, defaultResultCount: count! };
    } catch {
      return undefined;
    }
  }

  async put(owner: string, value: NooticrSettings) {
    await this.kv.put(this.key(owner), JSON.stringify(value));
  }
}

/** Stable owner keys prefer the authenticated Nooticr account ID. */
export async function settingsOwnerFromAuth(
  authInfo: AuthInfo | undefined,
  resolveAccountId?: (token: string) => Promise<string | undefined>
): Promise<string> {
  const token = authInfo?.token ?? "";
  const accountId = token && resolveAccountId ? await resolveAccountId(token) : undefined;
  if (accountId) return `account:${accountId}`;
  if (!token) return "local";

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `credential:${hex}`;
}
