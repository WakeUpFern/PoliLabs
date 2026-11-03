import { notificationsWeb } from "@/modules/notifications/web/services";
import { formatTime } from "@/shared/time";
import { markAllNotificationsRead, openNotification } from "./actions";
export default async function NotificationsPage() {
  const entries = await notificationsWeb.page();
  const unread = entries.some((n) => !n.readAt);
  return (
    <div>
      <p className="text-sm font-semibold text-guinda">Avisos</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Notificaciones
      </h1>
      {unread ? (
        <form action={markAllNotificationsRead} className="mt-4">
          <button className="text-sm font-semibold text-guinda underline-offset-4 hover:underline">
            Marcar todas como leídas
          </button>
        </form>
      ) : null}
      <ul className="mt-6 space-y-3" aria-label="Notificaciones recientes">
        {entries.map((n) => (
          <li
            key={n.id}
            className={`rounded-md border bg-surface p-5 ${n.readAt ? "border-line" : "border-guinda/40 shadow-sm"}`}
          >
            <form action={openNotification}>
              <input type="hidden" name="notificationId" value={n.id} />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {n.readAt ? "Leída" : "Nueva"} · {n.laboratoryName}
              </p>
              <h2 className="mt-2 break-words font-semibold">{n.title}</h2>
              <p className="mt-1 break-words text-muted">{n.body}</p>
              <p className="mt-2 text-sm text-muted">
                {formatTime(n.createdAt)}
              </p>
              <button
                className="mt-3 text-sm font-semibold text-guinda"
                aria-label={`Abrir: ${n.title}`}
              >
                Abrir
              </button>
            </form>
          </li>
        ))}
      </ul>
      {!entries.length ? (
        <p className="mt-6 text-muted">No tienes notificaciones.</p>
      ) : null}
    </div>
  );
}
