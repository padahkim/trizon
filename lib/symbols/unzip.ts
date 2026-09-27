import { inflateRawSync } from "node:zlib";

// 종목 마스터(KIS .zip, JPX .xlsx) 를 풀기 위한 최소 zip 리더.
// 크기는 central directory 에서 읽는다 — local header 의 크기는 data descriptor 를 쓰면 0 이다.
// zip64·암호화·분할 압축은 다루지 않는다 (두 소스 모두 1MB 안팎의 평범한 zip).

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** zip 안의 파일 전부 → { 경로: 내용 } */
export function unzip(data: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) throw new Error("zip: central directory 가 깨졌습니다");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`zip: ${name} 의 local header 가 없습니다`);
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(start, start + compressedSize);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`zip: 지원하지 않는 압축 방식 ${method} (${name})`);
  }
  return out;
}

function findEocd(buf: Buffer): number {
  // EOCD 는 22바이트 + 주석(최대 65535바이트) — 끝에서부터 찾는다
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("zip 파일이 아닙니다");
}
