const MAX_MESSAGE_BYTES = 512_000;

export type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export function encodeLspMessage(message: JsonRpcMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  if (body.byteLength > MAX_MESSAGE_BYTES) throw new Error("LSP message exceeds size limit");
  const header = new TextEncoder().encode(`Content-Length: ${body.byteLength}\r\n\r\n`);
  const output = new Uint8Array(header.byteLength + body.byteLength);
  output.set(header);
  output.set(body, header.byteLength);
  return output;
}

export class LspFrameParser {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): JsonRpcMessage[] {
    const combined = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    combined.set(this.buffer);
    combined.set(chunk, this.buffer.byteLength);
    this.buffer = combined;
    const messages: JsonRpcMessage[] = [];
    while (true) {
      const separator = this.findSeparator();
      if (separator < 0) break;
      const header = new TextDecoder().decode(this.buffer.slice(0, separator));
      const match = /^Content-Length:\s*(\d+)$/im.exec(header.trim());
      if (!match) throw new Error("Invalid LSP header");
      const length = Number(match[1]);
      if (!Number.isSafeInteger(length) || length > MAX_MESSAGE_BYTES) throw new Error("Invalid LSP message length");
      const bodyStart = separator + 4;
      if (this.buffer.byteLength < bodyStart + length) break;
      const body = new TextDecoder("utf-8", { fatal: true }).decode(this.buffer.slice(bodyStart, bodyStart + length));
      const parsed = JSON.parse(body) as JsonRpcMessage;
      if (parsed.jsonrpc !== "2.0" || Array.isArray(parsed) || (parsed.method === undefined && parsed.result === undefined && parsed.error === undefined)) throw new Error("Invalid JSON-RPC message");
      messages.push(parsed);
      this.buffer = this.buffer.slice(bodyStart + length);
    }
    return messages;
  }

  private findSeparator(): number {
    for (let index = 0; index <= this.buffer.byteLength - 4; index += 1) {
      if (this.buffer[index] === 13 && this.buffer[index + 1] === 10 && this.buffer[index + 2] === 13 && this.buffer[index + 3] === 10) return index;
    }
    return -1;
  }
}

export function makeRequest(id: string | number, method: string, params?: unknown): JsonRpcMessage {
  if (!/^[A-Za-z][A-Za-z0-9./_-]{0,127}$/.test(method)) throw new Error("Invalid LSP method");
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

export const LSP_LIMITS = { MAX_MESSAGE_BYTES } as const;
