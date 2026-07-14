const logError = console.error.bind(console)

console.error = (...args) =>
  logError(
    ...args.map((error) =>
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    ),
  )

export { default } from '@tanstack/react-start/server-entry'
