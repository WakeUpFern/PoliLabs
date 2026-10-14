import {
  MAX_DELIVERY_ATTEMPTS,
  nextAttemptDelayMs,
} from "../domain/notifications";
import type { EmailSender } from "./email-sender";
import type { DeliveryStore } from "./notification-store";
// Sends due email deliveries from the outbox, one transaction per attempt.
// Delivery is at least once: a crash after sending and before commit resends.
export class DeliveryDispatcher {
  constructor(
    private readonly store: DeliveryStore,
    private readonly sender: EmailSender,
    private readonly appOrigin: string,
  ) {}
  async dispatch(limit = 20) {
    const result = { sent: 0, failed: 0, retried: 0, skipped: 0 };
    for (let i = 0; i < limit; i++) {
      const found = await this.store.attemptNext(
        this.appOrigin,
        async (delivery, attempt) => {
          if (!delivery.recipientActive || !delivery.message) {
            result.skipped++;
            return attempt.skipped();
          }
          try {
            await this.sender.send(delivery.message);
          } catch {
            const attempts = delivery.attempts + 1;
            const final = attempts >= MAX_DELIVERY_ATTEMPTS;
            if (final) result.failed++;
            else result.retried++;
            return attempt.failed({
              attempts,
              final,
              delayMs: final ? 0 : nextAttemptDelayMs(attempts),
            });
          }
          result.sent++;
          await attempt.sent(delivery.message.to);
        },
      );
      if (!found) break;
    }
    return result;
  }
}
