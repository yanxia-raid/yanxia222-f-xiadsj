function decodeBase64Utf8(value: string): string {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeLatin1(value: Uint8Array): string {
  return new TextDecoder('latin1').decode(value);
}

function readTextChunks(bytes: Uint8Array): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const sig = [137,80,78,71,13,10,26,10];
  if (bytes.length < 8 || !sig.every((v, i) => bytes[i] === v)) throw new Error('不是有效 PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    if (len > bytes.length - off - 12) break;
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'tEXt') {
      const sep = data.indexOf(0);
      if (sep >= 0) {
        const key = decodeLatin1(data.subarray(0, sep));
        const value = decodeLatin1(data.subarray(sep + 1));
        (out[key] ||= []).push(value);
      }
    } else if (type === 'iTXt') {
      let p = 0;
      const readNull = () => { const s = p; while (p < data.length && data[p] !== 0) p++; return decodeLatin1(data.subarray(s, p++)); };
      const key = readNull();
      if (p + 2 > data.length) { off += len + 12; continue; }
      const compressed = data[p++];
      p++; // compression method
      readNull(); // language tag
      readNull(); // translated keyword
      if (compressed === 0) (out[key] ||= []).push(new TextDecoder().decode(data.subarray(p)));
    }
    off += len + 12;
  }
  return out;
}

export function extractTavernJsonFromPng(buffer: ArrayBuffer): { json: Record<string, unknown>; version: 'v3' | 'v2' | 'v1' } {
  const chunks = readTextChunks(new Uint8Array(buffer));
  const candidates: Array<[string, 'v3' | 'v2' | 'v1']> = [
    ['ccv3', 'v3'],
    ['chara', 'v2'],
  ];
  for (const [key, version] of candidates) {
    for (const raw of chunks[key] || []) {
      try {
        const decoded = decodeBase64Utf8(raw);
        const obj = JSON.parse(decoded) as Record<string, unknown>;
        if (obj && typeof obj === 'object') return { json: obj, version };
      } catch {}
    }
  }
  // A few legacy cards store plain JSON in the chunk.
  for (const raw of chunks.ai_phone_character || []) {
    try { return { json: JSON.parse(decodeBase64Utf8(raw)), version: 'v1' }; } catch {}
  }
  throw new Error('PNG 中没有找到 chara / ccv3 角色卡数据');
}
