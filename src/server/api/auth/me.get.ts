import { currentUser } from '../../utils/session'
export default defineEventHandler(async (event) => ({ user: await currentUser(event) }))
