<script setup lang="ts">
import type { Brand } from '~/composables/useBrands'
import { ALL_FONTS, TYPE_SCALE_PRESETS, BORDER_RADIUS_PRESETS } from '~/utils/fonts'

const toast = useToast()

// ─── Brand Data ──────────────────────────────────────────────────────────────

const { brands: brandList, pending, refresh } = useBrands()

// ─── Font Items (for searchable select) ──────────────────────────────────────

const fontItems = computed(() =>
  ALL_FONTS.map(f => ({
    label: f.label || f.family,
    value: f.family,
    description: `${f.source === 'google' ? 'Google' : 'System'} · ${f.category}`,
  })),
)

const typeScaleItems = TYPE_SCALE_PRESETS.map(p => ({
  label: p.label,
  value: p.value,
}))

const borderRadiusItems = BORDER_RADIUS_PRESETS.map(p => ({
  label: p.label,
  value: p.value,
}))

// ─── Form State ──────────────────────────────────────────────────────────────

interface BrandFormState {
  name: string
  primaryColor: string
  neutralColor: string
  accentColor: string
  fontFamily: string
  fontSource: 'google' | 'system'
  baseFontSize: number
  typeScaleRatio: string
  borderRadius: string
}

const defaultState: BrandFormState = {
  name: '',
  primaryColor: '#7458f5',
  neutralColor: '#64748b',
  accentColor: '#3b82f6',
  fontFamily: 'Poppins',
  fontSource: 'google',
  baseFontSize: 16,
  typeScaleRatio: '1.250',
  borderRadius: '0.325',
}

const formModalOpen = ref(false)
const editingBrand = ref<Brand | null>(null)
const formState = ref<BrandFormState>({ ...defaultState })
const saving = ref(false)

function openAddModal() {
  editingBrand.value = null
  formState.value = { ...defaultState }
  formModalOpen.value = true
}

function openEditModal(brand: Brand) {
  editingBrand.value = brand
  formState.value = {
    name: brand.name,
    primaryColor: brand.primaryColor,
    neutralColor: brand.neutralColor,
    accentColor: brand.accentColor,
    fontFamily: brand.fontFamily,
    fontSource: brand.fontSource as 'google' | 'system',
    baseFontSize: brand.baseFontSize,
    typeScaleRatio: brand.typeScaleRatio,
    borderRadius: brand.borderRadius,
  }
  formModalOpen.value = true
}

// Keep fontSource in sync when font selection changes
function onFontChange(family: string) {
  formState.value.fontFamily = family
  const font = ALL_FONTS.find(f => f.family === family)
  if (font) {
    formState.value.fontSource = font.source
  }
}

async function onFormSubmit() {
  if (!formState.value.name.trim()) return
  saving.value = true
  try {
    if (editingBrand.value) {
      await updateBrand(editingBrand.value.id, formState.value)
      toast.add({ title: 'Brand updated', color: 'success', icon: 'i-lucide-check' })
    }
    else {
      await createBrand(formState.value)
      toast.add({ title: 'Brand created', color: 'success', icon: 'i-lucide-check' })
    }
    formModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to save brand', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
  finally {
    saving.value = false
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

const deleteModalOpen = ref(false)
const deletingBrand = ref<Brand | null>(null)
const deleting = ref(false)

function confirmDelete(brand: Brand) {
  deletingBrand.value = brand
  deleteModalOpen.value = true
}

async function onDelete() {
  if (!deletingBrand.value) return
  deleting.value = true
  try {
    await deleteBrand(deletingBrand.value.id)
    toast.add({ title: 'Brand deleted', color: 'success', icon: 'i-lucide-check' })
    deleteModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to delete brand', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="max-w-5xl">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">Branding</h2>
        <p class="text-sm text-muted">
          Create brand profiles to apply custom colors, fonts, and styles to template previews.
        </p>
      </div>
      <UButton
        v-if="brandList?.length"
        icon="i-lucide-plus"
        label="Add Brand"
        @click="openAddModal"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="space-y-3">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-20 w-full" />
    </div>

    <!-- Empty State -->
    <EmptyState
      v-else-if="!brandList?.length"
      icon="i-lucide-palette"
      title="No brands created"
      description="Create a brand profile to customize the look and feel of your template previews."
    >
      <UButton
        icon="i-lucide-plus"
        label="Add Brand"
        @click="openAddModal"
      />
    </EmptyState>

    <!-- Brand List -->
    <div v-else class="space-y-3">
      <BrandCard
        v-for="brand in brandList"
        :key="brand.id"
        :brand="brand"
        @edit="openEditModal(brand)"
        @delete="confirmDelete(brand)"
      />
    </div>
  </div>

  <!-- Add/Edit Brand Modal -->
  <UModal
    v-model:open="formModalOpen"
    :title="editingBrand ? 'Edit Brand' : 'New Brand'"
    :description="editingBrand ? 'Update this brand profile.' : 'Create a new brand profile for template previews.'"
  >
    <template #body>
      <div class="space-y-5">
        <!-- Name -->
        <UFormField label="Name" required>
          <UInput
            v-model="formState.name"
            placeholder="e.g. Acme Corp"
            autofocus
          />
        </UFormField>

        <!-- Colors -->
        <div class="space-y-3">
          <p class="text-sm font-medium">Colors</p>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Primary">
              <div class="flex items-center gap-2">
                <input
                  v-model="formState.primaryColor"
                  type="color"
                  class="size-9 rounded-lg border border-default cursor-pointer shrink-0"
                />
                <UInput
                  v-model="formState.primaryColor"
                  placeholder="#7458f5"
                  class="flex-1"
                  size="sm"
                />
              </div>
            </UFormField>
            <UFormField label="Neutral">
              <div class="flex items-center gap-2">
                <input
                  v-model="formState.neutralColor"
                  type="color"
                  class="size-9 rounded-lg border border-default cursor-pointer shrink-0"
                />
                <UInput
                  v-model="formState.neutralColor"
                  placeholder="#64748b"
                  class="flex-1"
                  size="sm"
                />
              </div>
            </UFormField>
            <UFormField label="Accent">
              <div class="flex items-center gap-2">
                <input
                  v-model="formState.accentColor"
                  type="color"
                  class="size-9 rounded-lg border border-default cursor-pointer shrink-0"
                />
                <UInput
                  v-model="formState.accentColor"
                  placeholder="#3b82f6"
                  class="flex-1"
                  size="sm"
                />
              </div>
            </UFormField>
          </div>
        </div>

        <!-- Font -->
        <UFormField label="Font Family">
          <USelectMenu
            :model-value="formState.fontFamily"
            :items="fontItems"
            value-key="value"
            placeholder="Select a font..."
            searchable
            @update:model-value="onFontChange"
          />
        </UFormField>

        <!-- Typography & Shape -->
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Base Font Size">
            <UInput
              v-model.number="formState.baseFontSize"
              type="number"
              :min="10"
              :max="28"
              suffix="px"
            />
          </UFormField>
          <UFormField label="Type Scale">
            <USelectMenu
              v-model="formState.typeScaleRatio"
              :items="typeScaleItems"
              value-key="value"
            />
          </UFormField>
          <UFormField label="Border Radius">
            <USelectMenu
              v-model="formState.borderRadius"
              :items="borderRadiusItems"
              value-key="value"
            />
          </UFormField>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="formModalOpen = false" />
        <UButton
          :label="editingBrand ? 'Save' : 'Create'"
          :loading="saving"
          :disabled="!formState.name.trim()"
          @click="onFormSubmit"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete Confirmation -->
  <ConfirmModal
    v-model:open="deleteModalOpen"
    title="Delete Brand"
    :description="`Are you sure you want to delete &quot;${deletingBrand?.name}&quot;? This action cannot be undone.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="onDelete"
  />
</template>
