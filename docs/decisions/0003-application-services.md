# 0003 — Servicios de aplicación compartidos por web e IA

Estado: **Aceptada**

## Contexto y referencias

SRS PD2, PD6, RF36–38, §§11, 20–21, 29–31; instrucciones de arquitectura. Fuente: [SRS](../srs/PoliLabs-SRS.tex).

## Decisión

Las interfaces web, API y herramientas de Giussepe invocarán los mismos servicios de aplicación. Estos aplican permisos, relaciones, validación, transacciones y revalidación. Dominio independiente de presentación y SDK de IA.

## Alternativas consideradas

Reglas en componentes React o herramientas IA duplican lógica y permiten divergencias; acceso directo del agente a tablas incumple el SRS.

## Consecuencias

La futura IA se integra sin cambiar la autoridad operativa. No se implementan aún servicios, herramientas, confirmaciones ni auditoría; se construirán con cada flujo.
