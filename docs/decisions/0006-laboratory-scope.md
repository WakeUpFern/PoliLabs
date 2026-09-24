# 0006 — Alcance organizacional y membresías de laboratorio

Estado: **Propuesta**

## Contexto y referencias

SRS RNF8, §§22–24: spaces.organization_id aparece sin definir organizaciones ni membresías completas. Fuente: [SRS](../srs/PoliLabs-SRS.tex).

## Decisión

Proponer una base compartida con alcance explícito de laboratorio y membresías verificadas en servicios. Antes de crear tablas, decidir organización versus espacio/laboratorio, propiedad de catálogos y permisos globales o locales. No implementado ni aprobado.

## Alternativas consideradas

Una base por laboratorio aumenta operación; un catálogo sin alcance explícito dificulta aislamiento; RLS podría complementar servicios, pero requiere evaluación concreta.

## Consecuencias

Esta propuesta bloquea la primera migración de identidad/espacios, no la inicialización técnica. Requiere validación del responsable; no inventar tenant_id en todas las entidades ni afirmar aislamiento operativo.
