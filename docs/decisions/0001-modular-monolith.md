# 0001 — Monolito modular y stack web

Estado: **Aceptada**

## Contexto y referencias

SRS §§5, 10 (RNF3, RNF8, RNF12), 11; instrucciones de inicialización. Un equipo reducido necesita desarrollo local y crecimiento modular. Fuente: [SRS](../srs/PoliLabs-SRS.tex).

## Decisión

Un único proyecto TypeScript con Next.js App Router y React, organizado por dominios. Desarrollo local primero; AWS será el destino posterior.

## Alternativas consideradas

Microservicios añaden operación innecesaria; una aplicación sin límites de dominio dificulta evolución.

## Consecuencias

Un único despliegue simplifica operación. Los límites deben mantenerse en código y revisión; carpetas por sí solas no los garantizan.
