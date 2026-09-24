# 0002 — PostgreSQL autoritativo y Drizzle

Estado: **Aceptada**

## Contexto y referencias

SRS RNF4–6, §§11.1, 22, 30; Drizzle era propuesta en el SRS y queda aprobado explícitamente por esta sesión. Fuente: [SRS](../srs/PoliLabs-SRS.tex).

## Decisión

Usar PostgreSQL para datos transaccionales y Drizzle para acceso y migraciones revisadas. SQL explícito puede ser necesario para integridad. En esta base no hay tablas de negocio.

## Alternativas consideradas

Base documental como fuente primaria no responde al modelo relacional elegido; otro ORM no es necesario para el alcance acordado.

## Consecuencias

Las reglas críticas necesitan restricciones y transacciones reales. Configuración con pg y PostgreSQL 17 local; estrategia específica de concurrencia pendiente por caso de uso.
