# 0004 — Identidad desacoplada de permisos de negocio

Estado: **Aceptada**

## Contexto y referencias

SRS §§23–24, 31 y RF1. No hay integración institucional autorizada. Fuente: [SRS](../srs/PoliLabs-SRS.tex).

## Decisión

Representar usuarios y permisos de aplicación independientemente del proveedor de autenticación. Los roles agrupan permisos; una identidad externa se vinculará por identificador estable.

## Alternativas consideradas

Usar solo roles del proveedor o email como identidad estable acopla el dominio y complica migraciones.

## Consecuencias

Proveedor y biblioteca siguen pendientes; no se crea autenticación en esta sesión. El alcance de permisos entre laboratorios debe definirse antes de implementar membresías.

Actualización: el alcance local y las membresías con varios roles quedan definidos en el [ADR 0006 aceptado](0006-laboratory-scope.md). La decisión de desacoplar identidad y autorización se conserva.
