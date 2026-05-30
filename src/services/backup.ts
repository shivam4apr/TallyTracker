/**
 * TallyTracker — Backup & Restore Services
 *
 * Implements standard JSON-serialized and Base64-obfuscated backup utilities.
 * Handles Native (expo-file-system + expo-sharing) and Web platform support.
 */

import database from '../db';
import { TABLE_NAMES, APP_CONFIG } from '../utils/constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// ─── Base64 UTF-8 Safe Helpers ─────────────────────────────────

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Encode(str: string): string {
  let result = '';
  let i = 0;
  const len = str.length;
  while (i < len) {
    const c1 = str.charCodeAt(i++) & 0xff;
    if (i === len) {
      result += CHARS.charAt(c1 >> 2);
      result += CHARS.charAt((c1 & 0x3) << 4);
      result += '==';
      break;
    }
    const c2 = str.charCodeAt(i++);
    if (i === len) {
      result += CHARS.charAt(c1 >> 2);
      result += CHARS.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
      result += CHARS.charAt((c2 & 0xf) << 2);
      result += '=';
      break;
    }
    const c3 = str.charCodeAt(i++);
    result += CHARS.charAt(c1 >> 2);
    result += CHARS.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
    result += CHARS.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6));
    result += CHARS.charAt(c3 & 0x3f);
  }
  return result;
}

function b64Decode(str: string): string {
  const cleanStr = str.replace(/=+$/, '');
  const cleanLen = cleanStr.length;
  let i = 0;
  let buffer = '';

  const lookup = new Uint8Array(256);
  for (let idx = 0; idx < CHARS.length; idx++) {
    lookup[CHARS.charCodeAt(idx)] = idx;
  }

  while (i < cleanLen) {
    const enc1 = lookup[cleanStr.charCodeAt(i++)];
    const enc2 = lookup[cleanStr.charCodeAt(i++)];
    const enc3 = i < cleanLen ? lookup[cleanStr.charCodeAt(i++)] : 0;
    const enc4 = i < cleanLen ? lookup[cleanStr.charCodeAt(i++)] : 0;

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    buffer += String.fromCharCode(chr1);
    if (i - 2 < cleanLen && chr2 !== 0) {
      buffer += String.fromCharCode(chr2);
    }
    if (i - 1 < cleanLen && chr3 !== 0) {
      buffer += String.fromCharCode(chr3);
    }
  }
  return buffer;
}

export function utf8ToBase64(str: string): string {
  return b64Encode(unescape(encodeURIComponent(str)));
}

export function base64ToUtf8(str: string): string {
  return decodeURIComponent(escape(b64Decode(str)));
}

// ─── Backup Generation ─────────────────────────────────────────

export interface BackupPayload {
  version: number;
  timestamp: number;
  tables: Record<string, any[]>;
}

/**
 * Serializes all 8 tables of the WatermelonDB database into a single Base64 string.
 */
export async function generateBackup(): Promise<string> {
  const tablesToExport = Object.values(TABLE_NAMES);
  const backupData: Record<string, any[]> = {};

  for (const tableName of tablesToExport) {
    const records = await database.get(tableName).query().fetch();
    // Map WatermelonDB models to plain JSON objects (_raw contains exact columns & primary key ID)
    backupData[tableName] = records.map((record) => record._raw);
  }

  const payload: BackupPayload = {
    version: 1,
    timestamp: Date.now(),
    tables: backupData,
  };

  const jsonStr = JSON.stringify(payload);
  return utf8ToBase64(jsonStr);
}

// ─── Backup Restore ────────────────────────────────────────────

/**
 * Restores database from a given Base64 backup string.
 * Resets the entire database first, then populates in order.
 */
export async function restoreBackup(base64Data: string): Promise<void> {
  if (!base64Data || base64Data.trim() === '') {
    throw new Error('Backup data is empty');
  }

  let payload: BackupPayload;
  try {
    const jsonStr = base64ToUtf8(base64Data.trim());
    payload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Invalid backup format or corrupted file contents');
  }

  if (payload.version !== 1 || !payload.tables) {
    throw new Error('Unsupported backup schema version');
  }

  const tableOrder = [
    TABLE_NAMES.CA_USERS,
    TABLE_NAMES.ENTITIES,
    TABLE_NAMES.ACCOUNT_GROUPS,
    TABLE_NAMES.LEDGERS,
    TABLE_NAMES.VOUCHERS,
    TABLE_NAMES.VOUCHER_LINES,
    TABLE_NAMES.GST_COMPONENTS,
    TABLE_NAMES.HABITS,
  ];

  await database.write(async () => {
    // 1. Purge all records from local DB
    await database.unsafeResetDatabase();

    // 2. Insert records sequentially in order to respect reference keys
    for (const tableName of tableOrder) {
      const recordsToInsert = payload.tables[tableName];
      if (!recordsToInsert || recordsToInsert.length === 0) {
        continue;
      }

      const collection = database.get(tableName);
      const batchOps = recordsToInsert.map((item: any) =>
        collection.prepareCreate((record: any) => {
          // Object.assign directly writes all column attributes & id primary keys
          Object.assign(record._raw, item);
        })
      );

      await database.batch(...batchOps);
    }
  });
}

// ─── Sharing & Export Helpers ──────────────────────────────────

/**
 * Exports backup as a file. Shares natively on Mobile or triggers download on Web.
 */
export async function exportBackupFile(): Promise<void> {
  const base64Data = await generateBackup();

  if (Platform.OS === 'web') {
    // Web File Downloader
    const blob = new Blob([base64Data], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const dateStr = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `TallyTracker_Backup_${dateStr}${APP_CONFIG.BACKUP_EXTENSION}`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // Native Expo Sharing
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `TallyTracker_Backup_${dateStr}${APP_CONFIG.BACKUP_EXTENSION}`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    // Write file locally to cache directory
    await FileSystem.writeAsStringAsync(fileUri, base64Data, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Check sharing availability
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Export TallyTracker Backup',
        UTI: 'public.plain-text',
      });
    } else {
      throw new Error('Sharing is not supported on this device');
    }
  }
}
