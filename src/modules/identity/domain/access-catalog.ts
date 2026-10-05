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
