"use client";
import { useState } from "react";
import { IncidentForm } from "../incident-form";
import { targetLabels } from "../labels";
export function ReportForm({
  slug,
  targets,
  usages,
  initialTarget,
  initialUsage,
}: {
  slug: string;
  targets: {
    kind: "resource" | "space" | "session";
    id: string;
    name: string;
  }[];
  usages: {
    id: string;
    resourceId: string;
    resourceName: string;
    label: string;
  }[];
  initialTarget: string;
  initialUsage: string;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [usageId, setUsageId] = useState(initialUsage);
  const matching = target.startsWith("resource:")
    ? usages.filter((u) => u.resourceId === target.slice(9))
    : [];
  return (
    <IncidentForm slug={slug} operation="report" label="Reportar incidencia">
      <label className="block">
        Objetivo afectado
        <select
          name="target"
          required
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setUsageId("");
          }}
          className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
        >
          <option value="" disabled>
            Selecciona recurso, espacio o sesión
          </option>
          {targets.map((t) => (
            <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
              {targetLabels[t.kind]}: {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Uso propio asociado (opcional)
        <select
          name="usageId"
          value={usageId}
          onChange={(e) => setUsageId(e.target.value)}
          className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
        >
          <option value="">Observado sin uso asociado</option>
          {matching.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-stone-600">
        Puedes reportar fuera de clase, sin una sesión o reservación. Sólo
        aparecen tus usos que siguen abiertos para el recurso seleccionado.
      </p>
      <label className="block">
        Descripción
        <textarea
          name="description"
          required
          maxLength={5000}
          rows={5}
          className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
        />
      </label>
      <label className="block">
        Severidad
        <select
          name="severity"
          defaultValue="medium"
          required
          className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
        >
          <option value="low">Baja</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
        </select>
      </label>
    </IncidentForm>
  );
}
