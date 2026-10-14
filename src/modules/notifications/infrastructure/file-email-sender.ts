import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmailSender } from "../application/email-sender";
import type { EmailMessage } from "../domain/notifications";
// RFC 2047 encoded-word so non-ASCII subjects survive any mail reader.
function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}
// Local development adapter: writes each message as an .eml file that any
// mail client can open. It never contacts a network service.
export class FileEmailSender implements EmailSender {
  constructor(
    private readonly directory: string,
    private readonly from: string,
  ) {}
  async send(message: EmailMessage) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const content = [
      `From: ${this.from}`,
      `To: ${message.to}`,
      `Subject: ${encodeHeader(message.subject)}`,
      `Message-ID: <${message.id}@labora.local>`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      message.text,
      "",
    ].join("\r\n");
    // Same name per delivery: a retried attempt overwrites instead of duplicating.
    const target = join(this.directory, `${message.id}.eml`);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, target);
  }
}
