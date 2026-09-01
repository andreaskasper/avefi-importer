<script setup lang="ts">
/**
 * Auswahlfeld fuer eine Werteliste des AVefi-Schemas.
 *
 * Zwei Faelle, die im PHP-Stand stillschweigend falsch aussahen:
 *
 *  - Die Werteliste ist leer. Dann gab es ein normal aussehendes Auswahlfeld
 *    ohne Eintraege, und wer es benutzte, bekam „kein Wert" hinter gruener
 *    Anzeige. Geprueft wird deshalb der Inhalt, nicht die blosse Existenz: ohne
 *    Werte wird ein Textfeld mit Hinweis gezeigt, damit sich weiterarbeiten
 *    laesst.
 *  - Der gespeicherte Wert steht nicht in der Liste. Ein Auswahlfeld haette ihn
 *    beim ersten Speichern verworfen. Er bleibt als eigener Eintrag stehen und
 *    ist als „nicht in der Werteliste" gekennzeichnet.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    values: string[]
    id?: string
    label?: string
    placeholder?: string
    describedby?: string
  }>(),
  { id: undefined, label: undefined, placeholder: undefined, describedby: undefined }
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { t } = useI18n()

const hasValues = computed(() => props.values.length > 0)
const unknown = computed(() => props.modelValue !== '' && !props.values.includes(props.modelValue))
const showHint = computed(() => !hasValues.value || unknown.value)
// Die Verweisung darf nur stehen, wenn es das Ziel auch gibt: ein
// aria-describedby ins Leere ist fuer eine Vorlesesoftware ein Fehler.
const hintId = computed(() =>
  showHint.value && props.id !== undefined ? `${props.id}-hint` : undefined)
const described = computed(() => [props.describedby, hintId.value].filter(Boolean).join(' ') || undefined)

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLSelectElement | HTMLInputElement).value)
}
</script>

<template>
  <span class="ed-enum">
    <select v-if="hasValues" :id="id" class="ui-input" :value="modelValue"
            :aria-label="label" :aria-describedby="described" @change="onChange">
      <option value="">{{ placeholder ?? t('records.table.none') }}</option>
      <option v-if="unknown" :value="modelValue">{{ modelValue }}</option>
      <option v-for="v in values" :key="v" :value="v">{{ v }}</option>
    </select>
    <input v-else :id="id" class="ui-input" type="text" :value="modelValue" :placeholder="placeholder"
           :aria-label="label" :aria-describedby="described" @input="onChange">
    <span v-if="!hasValues" :id="hintId" class="note">{{ t('records.editor.enum.empty') }}</span>
    <span v-else-if="unknown" :id="hintId" class="note warnhint">
      {{ t('records.editor.enum.unknownValue', { value: modelValue }) }}
    </span>
  </span>
</template>

<style scoped>
/* Nur Layout: der Hinweis gehoert unter das Feld, nicht daneben. */
.ed-enum { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 }
</style>
