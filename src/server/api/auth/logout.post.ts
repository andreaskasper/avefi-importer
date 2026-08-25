import { session } from '../../utils/session'
export default defineEventHandler(async (event) => {
  await (await session(event)).clear()
  return { ok: true }
})
