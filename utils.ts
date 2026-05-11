
import { Capacitor } from '@capacitor/core';
import { SaveAs } from 'capacitor-save-as';
import { DMS } from './types';

/** Dekodira sadržaj fajla uz poštovanje BOM-a (UTF-8/UTF-16). Bez toga .txt iz Notepad/Excel može biti pogrešno pročitan i TAB se ne vidi. */
export const decodeFileText = (buffer: ArrayBuffer): string => {
  const u8 = new Uint8Array(buffer);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.slice(2));
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.slice(2));
  }
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.slice(3));
  }
  // UTF-16 LE bez BOM-a: ASCII znakovi su [char, 0][char, 0]...
  if (u8.length >= 4 && u8[1] === 0 && u8[3] === 0 && u8[0] !== 0) {
    let looksUtf16Le = true;
    const check = Math.min(u8.length, 40);
    for (let i = 0; i < check; i += 2) {
      if (i + 1 < u8.length && u8[i + 1] !== 0 && u8[i] < 0x80) {
        looksUtf16Le = false;
        break;
      }
    }
    if (looksUtf16Le) {
      return new TextDecoder('utf-16le').decode(buffer);
    }
  }
  return new TextDecoder('utf-8').decode(buffer);
};

/** Na osnovu prvog ne-praznog reda pogađa delimiter (TAB ima prioritet ako postoji znak tab). */
export const guessDelimiter = (text: string): string => {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r\n|\r|\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return ',';
  const line = lines[0];
  if (line.includes('\t')) return 'tab';
  const partsSemi = line.split(';').length;
  const partsComma = line.split(',').length;
  const partsPipe = line.split('|').length;
  if (partsSemi >= 3 && partsSemi >= partsComma) return ';';
  if (partsComma >= 3) return ',';
  if (partsPipe >= 3) return '|';
  if (line.trim().split(/\s+/).length >= 3) return 'space';
  return ',';
};

export const radiansToDMS = (radians: number): DMS => {
  let degrees = (radians * 180) / Math.PI;
  if (degrees < 0) degrees += 360;

  const deg = Math.floor(degrees);
  const minFloat = (degrees - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);

  // Handle carry over
  let finalSec = sec;
  let finalMin = min;
  let finalDeg = deg;

  if (finalSec >= 60) {
    finalSec -= 60;
    finalMin += 1;
  }
  if (finalMin >= 60) {
    finalMin -= 60;
    finalDeg += 1;
  }
  if (finalDeg >= 360) {
    finalDeg -= 360;
  }

  return { deg: finalDeg, min: finalMin, sec: finalSec };
};

export const formatDMS = (dms: DMS): string => {
  return `${dms.deg}° ${dms.min.toString().padStart(2, '0')}' ${dms.sec.toString().padStart(2, '0')}''`;
};

export const calculateDirection = (y1: number, x1: number, y2: number, x2: number) => {
  const dy = y2 - y1;
  const dx = x2 - x1;

  if (dy === 0 && dx === 0) return { angle: 0, distance: 0 };

  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += 2 * Math.PI;

  const distance = Math.sqrt(dy * dy + dx * dx);
  return { angle, distance };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Android/iOS: native Save As (capacitor-save-as).
 * Web: dijalog za lokaciju i naziv ako pregledač podržava File System Access API; inače preuzimanje + prompt za naziv.
 */
export const saveBlobWithFilePicker = async (options: {
  defaultName: string;
  mimeType: string;
  blob: Blob;
}): Promise<void> => {
  const { defaultName, mimeType, blob } = options;

  if (Capacitor.isNativePlatform()) {
    const data = arrayBufferToBase64(await blob.arrayBuffer());
    await SaveAs.showSaveAsPicker({
      filename: defaultName,
      mimeType,
      data,
    });
    return;
  }

  const w = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const ext = defaultName.includes('.') ? (defaultName.split('.').pop() || '') : '';
      const accept: Record<string, string[]> = {};
      if (ext === 'csv') accept['text/csv'] = ['.csv'];
      else if (ext === 'pdf') accept['application/pdf'] = ['.pdf'];
      else accept[mimeType] = [ext ? `.${ext}` : '*'];

      const handle = await w.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'Fajl', accept }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed, koristim rezervni način:', e);
    }
  }

  const entered = window.prompt('Naziv fajla (sa ekstenzijom)', defaultName);
  const name = entered && entered.trim() ? entered.trim() : defaultName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
