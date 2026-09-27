import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { unzip } from "./unzip.ts";

/** 테스트용 zip 작성기 — useDataDescriptor 면 local header 의 크기를 0 으로 둔다 (스트리밍 zip 처럼) */
function makeZip(files: Record<string, string | Buffer>, opts: { useDataDescriptor?: boolean; store?: boolean } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const data = opts.store ? raw : deflateRawSync(raw);
    const method = opts.store ? 0 : 8;
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(opts.useDataDescriptor ? 0 : data.length, 18);
    local.writeUInt32LE(opts.useDataDescriptor ? 0 : raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const descriptor = opts.useDataDescriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    locals.push(local, nameBuf, data, descriptor);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length + descriptor.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test("deflate·store 둘 다 풀고, 크기는 central directory 에서 읽는다", () => {
  const files = { "kospi_code.mst": "005930   KR7005930003삼성전자", "xl/sharedStrings.xml": "<sst/>" };
  for (const opts of [{}, { store: true }, { useDataDescriptor: true }]) {
    const out = unzip(makeZip(files, opts));
    assert.deepEqual([...out.keys()], Object.keys(files));
    assert.equal(out.get("kospi_code.mst")!.toString("utf8"), files["kospi_code.mst"]);
    assert.equal(out.get("xl/sharedStrings.xml")!.toString("utf8"), "<sst/>");
  }
});

test("zip 이 아니면 알 수 있는 오류로 실패한다", () => {
  assert.throws(() => unzip(Buffer.from("<html>maintenance</html>")), /zip 파일이 아닙니다/);
});
