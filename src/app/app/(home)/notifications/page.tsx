import { notificationsWeb } from "@/modules/notifications/web/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { markAllNotificationsRead, openNotification } from "./actions";
export default async function NotificationsPage() {
  const entries = await notificationsWeb.page();
  const unread = entries.some((n) => !n.readAt);
  return (
    <div>
      <p className="text-sm font-semibold text-[#7a1731]">Avisos</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Notificaciones
      </h1>
      {unread ? (
        <form action={markAllNotificationsRead} className="mt-4">
          <button className="text-sm font-semibold text-[#7a1731] underline-offset-4 hover:underline">
            Marcar todas como leídas
          </button>
        </form>
      ) : null}
      <ul className="mt-6 space-y-3" aria-label="Notificaciones recientes">
        {entries.map((n) => (
          <li
            key={n.id}
            className={`rounded-2xl border bg-white p-5 ${n.readAt ? "border-stone-200" : "border-[#7a1731]/40 shadow-sm"}`}
          >
            <form action={openNotification}>
              <input type="hidden" name="notificationId" value={n.id} />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {n.readAt ? "Leída" : "Nueva"} · {n.laboratoryName}
              </p>
              <h2 className="mt-2 break-words font-semibold">{n.title}</h2>
              <p className="mt-1 break-words text-stone-700">{n.body}</p>
              <p className="mt-2 text-sm text-stone-500">
                {formatAcademicTime(n.createdAt)}
              </p>
              <button
                className="mt-3 text-sm font-semibold text-[#7a1731]"
                aria-label={`Abrir: ${n.title}`}
              >
                Abrir
              </button>
            </form>
          </li>
        ))}
      </ul>
      {!entries.length ? (
        <p className="mt-6 text-stone-600">No tienes notificaciones.</p>
      ) : null}
    </div>
  );
}
