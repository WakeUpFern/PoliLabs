# 0005 — Archivos externos y adaptadores de integración

Estado: **Aceptada**

## Contexto y referencias

SRS RNF7, RNF10, §§18–20, 26–27, 30, 35; alcance local de esta sesión. Fuente: [SRS](../srs/PoliLabs-SRS.tex).

## Decisión

Separar binarios de PostgreSQL; S3 será el destino previsto y la base guardará metadatos. Servicios externos se integrarán por adaptadores concretos; notificaciones consumirán eventos. Bedrock queda previsto para Giussepe, sin implementación ahora.

## Alternativas consideradas

Binarios en tablas contradicen la orientación del SRS; SDK externos en el dominio incrementan acoplamiento.

## Consecuencias

No se aprovisiona AWS, no se instala SDK de IA y no se implementa un bus anticipado. Selección operativa de servicios, costos y garantías de entrega se resolverá cuando exista un caso de uso.
