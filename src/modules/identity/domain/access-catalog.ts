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
} as const;

export type PermissionKey =
  (typeof INITIAL_PERMISSIONS)[keyof typeof INITIAL_PERMISSIONS]["key"];

export const INITIAL_RESPONSIBLE_ROLE = {
  key: "laboratory_responsible",
  name: "Responsable de laboratorio",
  description:
    "Responsable inicial con las capacidades de identidad y catálogo espacial del laboratorio.",
} as const;

export const INITIAL_PERMISSION_LIST = Object.values(INITIAL_PERMISSIONS);
