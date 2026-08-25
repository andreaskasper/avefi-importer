/** Ohne Anmeldung geht nur die Anmeldeseite. */
const PUBLIC = new Set(['/login'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC.has(to.path)) return
  const { user, loaded, refresh } = useAuth()
  if (!loaded.value) await refresh()
  if (!user.value) return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
})
