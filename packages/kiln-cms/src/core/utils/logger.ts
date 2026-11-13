type LogFn = (obj: unknown, msg?: string) => void

function emit(level: string, obj: unknown, msg?: string) {
  const payload =
    typeof obj === 'string'
      ? { msg: obj, level }
      : { ...(obj as object), msg: msg || (obj as { msg?: string })?.msg, level }
  const line = JSON.stringify({ ...payload, time: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: ((obj, msg) => emit('info', obj, msg)) as LogFn,
  warn: ((obj, msg) => emit('warn', obj, msg)) as LogFn,
  error: ((obj, msg) => emit('error', obj, msg)) as LogFn,
  debug: ((obj, msg) => emit('debug', obj, msg)) as LogFn,
}

export default logger
