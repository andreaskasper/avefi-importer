<script setup lang="ts">
/** Rahmen fuer angemeldete Seiten. Kopfzeile, Navigation, Nutzermenue. */
const { user, logout } = useAuth()
const route = useRoute()
const { t } = useI18n()

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

const active = computed(() => {
  const p = route.path
  if (p.startsWith('/mappings')) return 'mappings'
  if (p.startsWith('/reviews')) return 'reviews'
  return 'imports'
})

const initials = computed(() => {
  const n = (user.value?.name || user.value?.email || '').trim()
  if (!n) return '?'
  const parts = n.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || n[0]!.toUpperCase()
})

const { data: reviewCount } = await useFetch<{ open: number }>('/api/reviews/count', {
  default: () => ({ open: 0 }),
  immediate: true
})

function onDocClick(e: MouseEvent) {
  if (menuOpen.value && menuRoot.value && !menuRoot.value.contains(e.target as Node)) menuOpen.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})

function toggleTheme() {
  const root = document.documentElement
  const cur = root.getAttribute('data-theme')
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : prefersDark ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
  try { localStorage.setItem('avefi-theme', next) } catch { /* Speicher gesperrt */ }
}
</script>

<template>
  <div>
    <a class="skip-link" href="#main">{{ t('skipToContent') }}</a>

    <header class="apphead">
      <NuxtLink class="logo" to="/" :aria-label="t('toStart')">
        <span class="applogo"><img src="/av-efi-logo.svg" alt="AV-EFI" height="26"></span>
      </NuxtLink>

      <nav :aria-label="t('mainNav')">
        <NuxtLink to="/" :class="active === 'imports' ? 'on' : ''"
                  :aria-current="active === 'imports' ? 'page' : undefined">{{ t('nav.imports') }}</NuxtLink>
        <NuxtLink to="/mappings" :class="active === 'mappings' ? 'on' : ''"
                  :aria-current="active === 'mappings' ? 'page' : undefined">{{ t('nav.mappings') }}</NuxtLink>
        <!-- Das Abzeichen zaehlt Zuordnungs-AUFGABEN (je Institution und Kopfzeile),
             die Kachel auf der Startseite zaehlt wartende DATEIEN. Beide Zahlen sind
             richtig und meinen Verschiedenes; der Titel sagt, welche hier steht. -->
        <NuxtLink v-if="user?.is_admin" to="/reviews" :class="active === 'reviews' ? 'on' : ''"
                  :title="reviewCount ? t('nav.reviewsTitle', { count: reviewCount.open }) : undefined">
          {{ t('nav.reviews') }}
          <span v-if="reviewCount && reviewCount.open > 0" class="badge b-wait"
                style="padding:1px 6px;margin-left:2px">{{ reviewCount.open }}</span>
        </NuxtLink>
      </nav>

      <div class="who">
        <span v-if="user?.institution_name" class="dim">{{ user.institution_name }}</span>
        <button class="ghost" :title="t('theme.switch')" :aria-label="t('theme.switch')" @click="toggleTheme">◐</button>

        <div v-if="user" ref="menuRoot" class="usermenu">
          <button class="avatar-btn" type="button" aria-haspopup="true" :aria-expanded="menuOpen"
                  :aria-label="t('userMenu', { name: user.name })" :title="user.name"
                  @click.stop="menuOpen = !menuOpen">
            <span class="avatar" aria-hidden="true">{{ initials }}</span>
          </button>
          <div class="menu" role="menu" :hidden="!menuOpen">
            <div class="menu-head">
              <div class="fn">{{ user.name }}</div>
              <div class="dim small">{{ user.email }}</div>
            </div>
            <NuxtLink class="menu-item" role="menuitem" to="/profile">{{ t('menu.profile') }}</NuxtLink>
            <NuxtLink v-if="user.is_admin" class="menu-item" role="menuitem" to="/users">{{ t('menu.users') }}</NuxtLink>
            <button class="menu-item" role="menuitem" type="button" @click="logout()">{{ t('menu.logout') }}</button>
          </div>
        </div>
      </div>
    </header>

    <slot />
  </div>
</template>
