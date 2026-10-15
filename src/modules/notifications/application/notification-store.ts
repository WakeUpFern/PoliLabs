import type { EmailMessage, NotificationEntry } from "../domain/notifications";
export interface NotificationTransaction {
  list(limit: number): Promise<NotificationEntry[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<NotificationEntry>;
  markAllRead(): Promise<number>;
}
export interface NotificationStore {
  run<T>(
    actorUserId: string,
    operation: (tx: NotificationTransaction) => Promise<T>,
  ): Promise<T>;
}

// A pending email delivery locked for the duration of one attempt.
export type ClaimedDelivery = {
  id: string;
  attempts: number;
  recipientActive: boolean;
  message: EmailMessage | null;
};
export interface DeliveryAttempt {
  sent(recipient: string): Promise<void>;
  failed(input: {
    attempts: number;
    final: boolean;
    delayMs: number;
  }): Promise<void>;
  skipped(): Promise<void>;
}
export interface DeliveryStore {
  // Runs one attempt in its own transaction; returns false when nothing is due.
  attemptNext(
    appOrigin: string,
    operation: (
      delivery: ClaimedDelivery,
      attempt: DeliveryAttempt,
    ) => Promise<void>,
  ): Promise<boolean>;
}
