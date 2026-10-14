// Notifications I: pure rules that turn business events into in-app
// notifications and transactional email deliveries (SRS §19, §33 criterion 14).
export class NotificationError extends Error {
  constructor(public readonly code: "input" | "not-found") {
    super(`Notification rejected: ${code}`);
    this.name = "NotificationError";
  }
}
export function notificationId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new NotificationError("input");
  return value.toLowerCase();
}

export type NotificationType = "incident.reported" | "incident.resolved";
export type NotificationReferenceType = "incident";
export type NotificationChannel = "email";
export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

// Events emitted by business modules inside their own transaction. They carry
// only what the message needs; recipients are resolved by this module.
export type NotificationEvent =
  | {
      type: "IncidentReported";
      laboratoryId: string;
      incidentId: string;
      reportedBy: string;
      severity: "low" | "medium" | "high";
      targetName: string;
      spaceName: string;
    }
  | {
      type: "IncidentResolved";
      laboratoryId: string;
      incidentId: string;
      reportedBy: string;
      resolvedBy: string;
      targetName: string;
      spaceName: string;
    };

export type RecipientRule =
  | { kind: "permission"; permission: "incident.review"; exclude: string }
  | {
      kind: "user";
      userId: string;
      permission: "incident.read";
      exclude: string;
    };

export type NotificationPlan = {
  type: NotificationType;
  laboratoryId: string;
  referenceType: NotificationReferenceType;
  referenceId: string;
  title: string;
  body: string;
  recipients: RecipientRule;
  email: boolean;
};

const severityLabels = { low: "Baja", medium: "Media", high: "Alta" } as const;

// The description stays out of notifications and email: the message points to
// the authorized detail page instead of copying free text.
export function planNotification(event: NotificationEvent): NotificationPlan {
  const place =
    event.targetName === event.spaceName
      ? event.spaceName
      : `${event.targetName} · ${event.spaceName}`;
  if (event.type === "IncidentReported")
    return {
      type: "incident.reported",
      laboratoryId: event.laboratoryId,
      referenceType: "incident",
      referenceId: event.incidentId,
      title:
        event.severity === "high"
          ? "Nueva incidencia de severidad alta"
          : "Nueva incidencia reportada",
      body: `${place} · Severidad ${severityLabels[event.severity].toLowerCase()}`,
      recipients: {
        kind: "permission",
        permission: "incident.review",
        exclude: event.reportedBy,
      },
      // Only critical reports justify an email (SRS §19.2).
      email: event.severity === "high",
    };
  return {
    type: "incident.resolved",
    laboratoryId: event.laboratoryId,
    referenceType: "incident",
    referenceId: event.incidentId,
    title: "Tu incidencia fue resuelta",
    body: place,
    recipients: {
      kind: "user",
      userId: event.reportedBy,
      permission: "incident.read",
      exclude: event.resolvedBy,
    },
    email: true,
  };
}

// Path inside the app for a notification; the target page authorizes again.
export function notificationPath(input: {
  type: NotificationType;
  laboratorySlug: string;
  referenceId: string;
}) {
  const scope = input.type === "incident.reported" ? "laboratory" : "own";
  return `/app/labs/${encodeURIComponent(input.laboratorySlug)}/incidents/${input.referenceId}?scope=${scope}`;
}

export const MAX_DELIVERY_ATTEMPTS = 5;
// Exponential backoff for failed email attempts: 1, 2, 4, 8 minutes.
export function nextAttemptDelayMs(attempts: number) {
  if (!Number.isSafeInteger(attempts) || attempts < 1)
    throw new NotificationError("input");
  return 60_000 * 2 ** Math.min(attempts - 1, 6);
}

export type EmailMessage = {
  id: string;
  to: string;
  subject: string;
  text: string;
};

export function renderNotificationEmail(input: {
  deliveryId: string;
  recipientEmail: string;
  recipientName: string;
  laboratoryName: string;
  title: string;
  body: string;
  url: string;
}): EmailMessage {
  if (
    /[\r\n]/.test(input.recipientEmail) ||
    !input.recipientEmail.includes("@")
  )
    throw new NotificationError("input");
  return {
    id: input.deliveryId,
    to: input.recipientEmail,
    subject: `${input.title} · ${input.laboratoryName}`.replace(
      /[\r\n]+/g,
      " ",
    ),
    text: [
      `Hola ${input.recipientName}:`,
      "",
      input.title,
      input.body,
      "",
      `Consulta el detalle en Labora: ${input.url}`,
      "",
      "Este es un mensaje automático de Labora. No respondas a este correo.",
    ].join("\n"),
  };
}

export type NotificationEntry = {
  id: string;
  type: NotificationType;
  laboratoryName: string;
  laboratorySlug: string;
  referenceId: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};
