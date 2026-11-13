import { type DbClient, getStore } from '../core/request-context'

export type { DbClient }

export const db = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    const client = getStore().db
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
