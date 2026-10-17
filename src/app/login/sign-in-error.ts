export type SignInFailure = {
  status?: number;
  code?: string;
};

export const signInErrorMessages = {
  credentials:
    "No pudimos iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.",
  rateLimited:
    "Hiciste demasiados intentos. Espera un momento antes de volver a intentarlo.",
  origin:
    "El servidor rechazó el inicio de sesión desde esta dirección. Ábrelo desde la dirección configurada o pide que se agregue a los orígenes permitidos.",
  unavailable:
    "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
} as const;

export function describeSignInFailure(failure: SignInFailure): string {
  if (
    failure.code === "INVALID_ORIGIN" ||
    failure.code === "MISSING_OR_NULL_ORIGIN"
  )
    return signInErrorMessages.origin;
  if (failure.status === 429) return signInErrorMessages.rateLimited;
  if (failure.status === 401 || failure.status === 400)
    return signInErrorMessages.credentials;
  if (failure.status === 403) return signInErrorMessages.origin;
  return signInErrorMessages.unavailable;
}
