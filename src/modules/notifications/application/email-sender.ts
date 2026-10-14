import type { EmailMessage } from "../domain/notifications";
// Port for transactional email providers (SRS §19.2, RNF10). Local disk now;
// Amazon SES is the intended production adapter.
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
