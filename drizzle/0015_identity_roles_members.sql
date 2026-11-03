ALTER TABLE "users" ADD COLUMN "temporary_password_issued_at" timestamp with time zone;
--> statement-breakpoint
-- Permissions that bootstrap used to create are now part of the schema, so a
-- fresh installation can hold the role catalog before its first account.
INSERT INTO permissions (key, name, description) VALUES
 ('laboratory.read', 'Consultar laboratorio', 'Permite consultar los datos básicos del laboratorio autorizado.'),
 ('laboratory.membership.manage', 'Administrar membresías', 'Permite administrar membresías dentro del laboratorio autorizado.'),
 ('laboratory.role.assign', 'Asignar roles', 'Permite asignar roles a membresías del laboratorio autorizado.'),
 ('space.read', 'Consultar espacios', 'Permite consultar los espacios activos del laboratorio autorizado.'),
 ('space.manage', 'Administrar espacios', 'Permite crear, editar y desactivar espacios del laboratorio autorizado.'),
 ('location.read', 'Consultar ubicaciones', 'Permite consultar las ubicaciones activas de los espacios del laboratorio autorizado.'),
 ('location.manage', 'Administrar ubicaciones', 'Permite crear, editar y desactivar ubicaciones de los espacios del laboratorio autorizado.'),
 ('resource.read', 'Consultar recursos', 'Permite consultar los recursos físicos activos de los espacios del laboratorio autorizado.'),
 ('resource.manage', 'Administrar recursos', 'Permite crear, editar y desactivar recursos físicos de los espacios del laboratorio autorizado.'),
 ('inventory.read', 'Consultar inventario', 'Consultar artículos, existencias e historial del laboratorio.'),
 ('inventory.manage', 'Administrar artículos', 'Crear, editar y desactivar artículos del laboratorio.'),
 ('inventory.adjust', 'Registrar movimientos', 'Registrar entradas, consumos, daños, pérdidas y ajustes del laboratorio.'),
 ('inventory.loan', 'Registrar préstamos', 'Registrar préstamos y devoluciones de herramientas y consultar los préstamos del laboratorio.'),
 ('inventory.loan.read', 'Consultar préstamos propios', 'Consultar únicamente los préstamos propios.'),
 ('attendance.read', 'Consultar asistencia propia', 'Consultar únicamente la asistencia propia.'),
 ('attendance.checkin', 'Registrar asistencia propia', 'Confirmar asistencia propia en sesiones abiertas.'),
 ('attendance.manage', 'Gestionar asistencia', 'Consultar y corregir asistencia sin intervenir en sesiones propias.'),
 ('usage.read', 'Consultar uso propio', 'Consultar el historial propio de uso efectivo.'),
 ('usage.record', 'Registrar uso propio', 'Iniciar y terminar uso propio en un contexto autorizado.'),
 ('usage.trace', 'Consultar trazabilidad de uso', 'Consultar usos previos de recursos del laboratorio sin inferir responsabilidad.'),
 ('incident.create', 'Reportar incidencias', 'Reportar problemas sobre recursos, espacios o sesiones autorizadas.'),
 ('incident.read', 'Consultar incidencias propias', 'Consultar reportes propios y su seguimiento.'),
 ('incident.review', 'Revisar incidencias del laboratorio', 'Consultar reportes y seguimiento del laboratorio.'),
 ('incident.resolve', 'Gestionar y resolver incidencias', 'Revisar y resolver incidencias con notas trazables.'),
 ('maintenance.read', 'Consultar mantenimiento', 'Consultar estado operativo y bitácoras de mantenimiento del laboratorio.'),
 ('maintenance.create', 'Registrar mantenimiento', 'Registrar entradas de mantenimiento y el estado operativo resultante de recursos.'),
 ('document.read', 'Consultar documentos', 'Consultar y descargar manuales y documentos de los recursos del laboratorio.'),
 ('document.upload', 'Subir documentos', 'Subir manuales a recursos y, con permiso de mantenimiento, evidencia a sus entradas.'),
 ('document.archive', 'Archivar documentos', 'Archivar documentos del laboratorio con motivo, sin borrar el archivo ni su historial.'),
 ('academic.read', 'Consultar prácticas y sesiones', 'Consultar prácticas publicadas y sesiones propias del laboratorio.'),
 ('academic.manage', 'Administrar prácticas y sesiones', 'Gestionar prácticas, sesiones y participantes sin modificar la propia participación.'),
 ('reservation.read', 'Consultar reservaciones propias', 'Consultar disponibilidad y reservaciones propias del laboratorio.'),
 ('reservation.create', 'Crear reservaciones', 'Crear reservaciones individuales del laboratorio.'),
 ('reservation.cancel', 'Cancelar reservaciones propias', 'Cancelar reservaciones propias antes de su inicio.')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- Laboratory role catalog (ADR 0022).
INSERT INTO roles (key, name, description) VALUES
 ('laboratory_responsible', 'Responsable de laboratorio', 'Responsable inicial con las capacidades de identidad, catálogo espacial, inventario y reservaciones propias del laboratorio.'),
 ('laboratory_teacher', 'Profesor', 'Prepara prácticas y sesiones, pasa lista, registra préstamos, revisa incidencias y da de alta a sus alumnos.'),
 ('laboratory_student', 'Alumno', 'Consulta sus prácticas, reserva equipo, registra su asistencia y su uso de maquinaria y reporta fallas.')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_responsible' AND p.key IN ('laboratory.read','laboratory.membership.manage','laboratory.role.assign','space.read','space.manage','location.read','location.manage','resource.read','resource.manage','inventory.read','inventory.manage','inventory.adjust','inventory.loan','inventory.loan.read','attendance.read','attendance.checkin','attendance.manage','usage.read','usage.record','usage.trace','incident.create','incident.read','incident.review','incident.resolve','maintenance.read','maintenance.create','document.read','document.upload','document.archive','academic.read','academic.manage','reservation.read','reservation.create','reservation.cancel')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_teacher' AND p.key IN ('laboratory.read','laboratory.membership.manage','laboratory.role.assign','space.read','space.manage','location.read','resource.read','academic.read','academic.manage','attendance.manage','usage.trace','reservation.read','reservation.create','reservation.cancel','incident.create','incident.read','incident.review','incident.resolve','maintenance.read','inventory.read','inventory.loan','document.read')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_student' AND p.key IN ('laboratory.read','space.read','location.read','resource.read','academic.read','attendance.read','attendance.checkin','usage.read','usage.record','reservation.read','reservation.create','reservation.cancel','incident.create','incident.read','inventory.loan.read','document.read')
ON CONFLICT DO NOTHING;
