export const INITIAL_PERMISSIONS = {
  laboratoryRead: {
    key: "laboratory.read",
    name: "Consultar laboratorio",
    description:
      "Permite consultar los datos básicos del laboratorio autorizado.",
  },
  laboratoryMembershipManage: {
    key: "laboratory.membership.manage",
    name: "Administrar membresías",
    description:
      "Permite administrar membresías dentro del laboratorio autorizado.",
  },
  laboratoryRoleAssign: {
    key: "laboratory.role.assign",
    name: "Asignar roles",
    description:
      "Permite asignar roles a membresías del laboratorio autorizado.",
  },
  spaceRead: {
    key: "space.read",
    name: "Consultar espacios",
    description:
      "Permite consultar los espacios activos del laboratorio autorizado.",
  },
  spaceManage: {
    key: "space.manage",
    name: "Administrar espacios",
    description:
      "Permite crear, editar y desactivar espacios del laboratorio autorizado.",
  },
  locationRead: {
    key: "location.read",
    name: "Consultar ubicaciones",
    description:
      "Permite consultar las ubicaciones activas de los espacios del laboratorio autorizado.",
  },
  locationManage: {
    key: "location.manage",
    name: "Administrar ubicaciones",
    description:
      "Permite crear, editar y desactivar ubicaciones de los espacios del laboratorio autorizado.",
  },
  resourceRead: {
    key: "resource.read",
    name: "Consultar recursos",
    description:
      "Permite consultar los recursos físicos activos de los espacios del laboratorio autorizado.",
  },
  resourceManage: {
    key: "resource.manage",
    name: "Administrar recursos",
    description:
      "Permite crear, editar y desactivar recursos físicos de los espacios del laboratorio autorizado.",
  },
  inventoryRead: {
    key: "inventory.read",
    name: "Consultar inventario",
    description:
      "Consultar artículos, existencias e historial del laboratorio.",
  },
  inventoryManage: {
    key: "inventory.manage",
    name: "Administrar artículos",
    description: "Crear, editar y desactivar artículos del laboratorio.",
  },
  inventoryAdjust: {
    key: "inventory.adjust",
    name: "Registrar movimientos",
    description:
      "Registrar entradas, consumos, daños, pérdidas y ajustes del laboratorio.",
  },
  attendance_read: {
    key: "attendance.read",
    name: "Consultar asistencia propia",
    description: "Consultar únicamente la asistencia propia.",
  },
  attendance_checkin: {
    key: "attendance.checkin",
    name: "Registrar asistencia propia",
    description: "Confirmar asistencia propia en sesiones abiertas.",
  },
  attendance_manage: {
    key: "attendance.manage",
    name: "Gestionar asistencia",
    description:
      "Consultar y corregir asistencia sin intervenir en sesiones propias.",
  },
  usage_read: {
    key: "usage.read",
    name: "Consultar uso propio",
    description: "Consultar el historial propio de uso efectivo.",
  },
  usage_record: {
    key: "usage.record",
    name: "Registrar uso propio",
    description: "Iniciar y terminar uso propio en un contexto autorizado.",
  },
  usage_trace: {
    key: "usage.trace",
    name: "Consultar trazabilidad de uso",
    description:
      "Consultar usos previos de recursos del laboratorio sin inferir responsabilidad.",
  },
  incidentCreate: {
    key: "incident.create",
    name: "Reportar incidencias",
    description:
      "Reportar problemas sobre recursos, espacios o sesiones autorizadas.",
  },
  incidentRead: {
    key: "incident.read",
    name: "Consultar incidencias propias",
    description: "Consultar reportes propios y su seguimiento.",
  },
  incidentReview: {
    key: "incident.review",
    name: "Revisar incidencias del laboratorio",
    description: "Consultar reportes y seguimiento del laboratorio.",
  },
  incidentResolve: {
    key: "incident.resolve",
    name: "Gestionar y resolver incidencias",
    description: "Revisar y resolver incidencias con notas trazables.",
  },
  academicRead: {
    key: "academic.read",
    name: "Consultar prácticas y sesiones",
    description:
      "Consultar prácticas publicadas y sesiones propias del laboratorio.",
  },
  academicManage: {
    key: "academic.manage",
    name: "Administrar prácticas y sesiones",
    description:
      "Gestionar prácticas, sesiones y participantes sin modificar la propia participación.",
  },
  reservationRead: {
    key: "reservation.read",
    name: "Consultar reservaciones propias",
    description:
      "Consultar disponibilidad y reservaciones propias del laboratorio.",
  },
  reservationCreate: {
    key: "reservation.create",
    name: "Crear reservaciones",
    description: "Crear reservaciones individuales del laboratorio.",
  },
  reservationCancel: {
    key: "reservation.cancel",
    name: "Cancelar reservaciones propias",
    description: "Cancelar reservaciones propias antes de su inicio.",
  },
} as const;

export type PermissionKey =
  (typeof INITIAL_PERMISSIONS)[keyof typeof INITIAL_PERMISSIONS]["key"];

export const INITIAL_RESPONSIBLE_ROLE = {
  key: "laboratory_responsible",
  name: "Responsable de laboratorio",
  description:
    "Responsable inicial con las capacidades de identidad, catálogo espacial, inventario y reservaciones propias del laboratorio.",
} as const;

export const INITIAL_PERMISSION_LIST = Object.values(INITIAL_PERMISSIONS);
