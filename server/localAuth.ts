import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LocalProfile } from '../src/types/devmind.ts';

interface StoredLocalProfileRecord {
  id: string;
  displayName: string;
  email: string;
  passcodeSalt?: string;
  passcodeHash?: string;
  linkedFirebaseUid?: string;
  linkedFirebaseEmail?: string;
  createdAt: string;
  lastActiveAt: string;
}

interface LocalProfilesDiskFormat {
  schemaVersion: number;
  profiles: StoredLocalProfileRecord[];
}

const SCHEMA_VERSION = 1;

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    } catch {
      // Non-fatal backup error
    }
  }
  fs.renameSync(tmpPath, filePath);
}

function hashPasscode(passcode: string, saltHex: string): string {
  const derived = crypto.scryptSync(passcode, Buffer.from(saltHex, 'hex'), 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return derived.toString('hex');
}

function verifyPasscodeHash(passcode: string, saltHex: string, expectedHashHex: string): boolean {
  const actual = Buffer.from(hashPasscode(passcode, saltHex), 'hex');
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export class LocalProfileStore {
  private profiles = new Map<string, StoredLocalProfileRecord>();
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(path.resolve(dataDir), 'local-profiles.json');
    this.load();
  }

  public reconfigureDataDir(dataDir: string): void {
    const nextPath = path.join(path.resolve(dataDir), 'local-profiles.json');
    if (nextPath === this.filePath) return;
    this.filePath = nextPath;
    this.profiles.clear();
    this.load();
  }

  private toPublic(rec: StoredLocalProfileRecord): LocalProfile {
    return {
      id: rec.id,
      displayName: rec.displayName,
      email: rec.email,
      hasPasscode: Boolean(rec.passcodeHash && rec.passcodeSalt),
      linkedFirebaseUid: rec.linkedFirebaseUid,
      linkedFirebaseEmail: rec.linkedFirebaseEmail,
      createdAt: rec.createdAt,
      lastActiveAt: rec.lastActiveAt,
    };
  }

  private load(): void {
    const candidates = [this.filePath, `${this.filePath}.bak`];
    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed = JSON.parse(raw) as Partial<LocalProfilesDiskFormat>;
        if (!Array.isArray(parsed.profiles)) continue;
        for (const item of parsed.profiles) {
          if (item && typeof item.id === 'string' && typeof item.displayName === 'string') {
            this.profiles.set(item.id, item);
          }
        }
        return;
      } catch {
        // Try backup if primary was interrupted during write
      }
    }
  }

  public flush(): void {
    try {
      const disk: LocalProfilesDiskFormat = {
        schemaVersion: SCHEMA_VERSION,
        profiles: Array.from(this.profiles.values()),
      };
      atomicWriteJson(this.filePath, disk);
    } catch {
      // Non-fatal in read-only containers
    }
  }

  public listProfiles(): LocalProfile[] {
    return Array.from(this.profiles.values())
      .map((rec) => this.toPublic(rec))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  public getProfile(id: string): LocalProfile | null {
    const rec = this.profiles.get(id);
    return rec ? this.toPublic(rec) : null;
  }

  public createProfile(input: {
    displayName: string;
    email?: string;
    passcode?: string;
    linkedFirebaseUid?: string;
    linkedFirebaseEmail?: string;
  }): LocalProfile {
    const displayName = input.displayName.trim().slice(0, 80);
    if (!displayName) {
      throw new Error('Display name is required to create a local profile.');
    }

    const email = (input.email?.trim() || `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@local.devmind`).slice(0, 160);
    const passcode = (input.passcode ?? '').trim();
    if (passcode && passcode.length < 4) {
      throw new Error('Optional local passcode must be at least 4 characters.');
    }

    const now = new Date().toISOString();
    const record: StoredLocalProfileRecord = {
      id: `lprof_${crypto.randomBytes(5).toString('hex')}`,
      displayName,
      email,
      linkedFirebaseUid: input.linkedFirebaseUid?.trim() || undefined,
      linkedFirebaseEmail: input.linkedFirebaseEmail?.trim() || undefined,
      createdAt: now,
      lastActiveAt: now,
    };

    if (passcode) {
      const salt = crypto.randomBytes(16).toString('hex');
      record.passcodeSalt = salt;
      record.passcodeHash = hashPasscode(passcode, salt);
    }

    this.profiles.set(record.id, record);
    this.flush();
    return this.toPublic(record);
  }

  public verifyAndTouchProfile(id: string, passcode?: string): LocalProfile {
    const rec = this.profiles.get(id);
    if (!rec) {
      throw new Error('Local profile not found.');
    }

    if (rec.passcodeHash && rec.passcodeSalt) {
      const provided = (passcode ?? '').trim();
      if (!provided) {
        throw new Error('Passcode is required to unlock this local profile.');
      }
      if (!verifyPasscodeHash(provided, rec.passcodeSalt, rec.passcodeHash)) {
        throw new Error('Invalid local profile passcode.');
      }
    }

    rec.lastActiveAt = new Date().toISOString();
    this.flush();
    return this.toPublic(rec);
  }

  public linkFirebaseAccount(
    id: string,
    firebaseUid: string | null,
    firebaseEmail?: string | null
  ): LocalProfile {
    const rec = this.profiles.get(id);
    if (!rec) {
      throw new Error('Local profile not found.');
    }
    rec.linkedFirebaseUid = firebaseUid?.trim() || undefined;
    rec.linkedFirebaseEmail = firebaseEmail?.trim() || undefined;
    rec.lastActiveAt = new Date().toISOString();
    this.flush();
    return this.toPublic(rec);
  }

  public deleteProfile(id: string): boolean {
    const existed = this.profiles.delete(id);
    if (existed) {
      this.flush();
    }
    return existed;
  }
}
