export function safeReturnPath(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\/app(?:\/|\?|$)/.test(value) ||
    /[\\\r\n]/.test(value) ||
    /%2f|%5c|%0[ad]/i.test(value)
  )
    return "/app";
  return value;
}
