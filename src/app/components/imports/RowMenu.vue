<script setup lang="ts">
/**
 * Das „…"-Menue einer Importzeile.
 *
 * Das Menue haengt an <body>, nicht in der Zelle: Die Tabelle rollt waagerecht
 * (.tablewrap hat overflow-x), und ein Menue innerhalb davon waere
 * abgeschnitten. Die Lage kommt aus dem Rechteck des Knopfs.
 *
 * Tastatur: Pfeiltasten wandern durch die Eintraege, Pos1/Ende springen,
 * Escape schliesst und gibt den Fokus an den Knopf zurueck.
 */
import type { ImportListItem } from './types'

const api = useApi()

const props = defineProps<{ item: ImportListItem }>()
const emit = defineEmits<{ reconvert: []; delete: [] }>()
const { t } = useI18n()

const open = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0 })

const issueCount = computed(() => props.item.issues.error + props.item.issues.warning)

function place() {
  const rect = button.value?.getBoundingClientRect()
  if (!rect) return
  const width = 250
  pos.value = {
    top: Math.min(rect.bottom + 6, window.innerHeight - 40),
    left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
  }
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  place()
  await nextTick()
  items()[0]?.focus()
}

function close(focusButton = false) {
  if (!open.value) return
  open.value = false
  if (focusButton) button.value?.focus()
}

function items(): HTMLElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}

function onMenuKey(e: KeyboardEvent) {
  const list = items()
  if (list.length === 0) return
  const index = list.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'Escape') {
    e.preventDefault()
    close(true)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    list[(index + 1) % list.length]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    list[(index - 1 + list.length) % list.length]?.focus()
  } else if (e.key === 'Home') {
    e.preventDefault()
    list[0]?.focus()
  } else if (e.key === 'End') {
    e.preventDefault()
    list[list.length - 1]?.focus()
  } else if (e.key === 'Tab') {
    close()
  }
}

function onDocPointer(e: PointerEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (button.value?.contains(target) || menu.value?.contains(target)) return
  close()
}

function onScroll() {
  if (open.value) place()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('resize', onScroll, true)
  window.addEventListener('scroll', onScroll, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('resize', onScroll, true)
  window.removeEventListener('scroll', onScroll, true)
})

function pick(fn: () => void) {
  close()
  fn()
}
</script>

<template>
  <div class="rowmenu">
    <button ref="button" type="button" class="iconbtn-menu" aria-haspopup="menu" :aria-expanded="open"
            :aria-label="t('imports.action.more', { name: item.filename })" @click="toggle">
      <span aria-hidden="true">⋯</span>
    </button>

    <ClientOnly>
      <Teleport to="body">
      <div v-if="open" ref="menu" class="ui-menu ui-menu-float" role="menu"
           :aria-label="t('imports.action.menuLabel', { name: item.filename })"
           :style="{ top: pos.top + 'px', left: pos.left + 'px' }" @keydown="onMenuKey">
        <NuxtLink v-if="item.hasMapping" class="ui-menu-item" role="menuitem" :to="`/imports/${item.id}/mapping`"
                  @click="close()">
          <span class="mi" aria-hidden="true">⇄</span>{{ t('imports.menu.mapping') }}
        </NuxtLink>

        <NuxtLink v-if="item.hasReport" class="ui-menu-item" role="menuitem" :to="`/imports/${item.id}/report`"
                  @click="close()">
          <span class="mi" aria-hidden="true">☑</span>{{ t('imports.menu.report') }}
          <span v-if="issueCount > 0" class="dim"> {{ t('imports.menu.reportIssues') }}</span>
        </NuxtLink>

        <NuxtLink class="ui-menu-item" role="menuitem" :to="`/imports/${item.id}`" @click="close()">
          <span class="mi" aria-hidden="true">☰</span>{{ t('imports.menu.detail') }}
        </NuxtLink>

        <a class="ui-menu-item" role="menuitem" :href="api(`/imports/${item.id}/original`)" @click="close()">
          <span class="mi" aria-hidden="true">⤓</span>{{ t('imports.menu.original') }}
        </a>

        <a v-if="item.hasAvefi" class="ui-menu-item" role="menuitem" :href="api(`/imports/${item.id}/avefi.json`)"
           @click="close()">
          <span class="mi" aria-hidden="true">{}</span>
          <template v-if="item.validated">{{ t('imports.menu.avefi') }}</template>
          <template v-else>{{ t('imports.menu.avefiDraft') }}</template>
        </a>

        <button v-if="item.canReconvert" type="button" class="ui-menu-item" role="menuitem"
                @click="pick(() => emit('reconvert'))">
          <span class="mi" aria-hidden="true">↻</span>{{ t('imports.menu.reconvert') }}
        </button>

        <div class="ui-menu-sep" role="separator" />

        <button type="button" class="ui-menu-item danger" role="menuitem" @click="pick(() => emit('delete'))">
          <span class="mi" aria-hidden="true">🗑</span>{{ t('imports.menu.delete') }}
        </button>
      </div>
      </Teleport>
    </ClientOnly>
  </div>
</template>
