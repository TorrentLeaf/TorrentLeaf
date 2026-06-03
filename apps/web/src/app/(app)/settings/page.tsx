'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings as SettingsIcon,
  FolderDown,
  BookOpen,
  Monitor,
  Save,
  Loader2,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchSettings, updateSettings, type UserSettings } from '@/lib/settings'
import { useToast } from '@/hooks/use-toast'

const READING_MODES = [
  { value: 'paginated', label: 'Paginated' },
  { value: 'webtoon', label: 'Webtoon (Scroll)' },
  { value: 'double-page', label: 'Double Page' },
]

const FIT_MODES = [
  { value: 'fit-width', label: 'Fit Width' },
  { value: 'fit-height', label: 'Fit Height' },
  { value: 'original', label: 'Original Size' },
]

const DIRECTIONS = [
  { value: 'ltr', label: 'Left to Right' },
  { value: 'rtl', label: 'Right to Left' },
]

const BACKGROUNDS = [
  { value: '#000000', label: 'Black', class: 'bg-black' },
  { value: '#1a1a2e', label: 'Dark Blue', class: 'bg-[#1a1a2e]' },
  { value: '#1e1e1e', label: 'Dark Gray', class: 'bg-[#1e1e1e]' },
  { value: '#ffffff', label: 'White', class: 'bg-white' },
]

function SelectGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
              value === opt.value
                ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted))] hover:border-[hsl(var(--accent))]/40'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const [form, setForm] = useState<Partial<UserSettings>>({})

  // Merge form overrides on top of server state.
  const current: UserSettings = {
    downloadPath: form.downloadPath ?? settings?.downloadPath ?? '/data/torrents',
    defaultReadingMode: form.defaultReadingMode ?? settings?.defaultReadingMode ?? 'paginated',
    defaultFitMode: form.defaultFitMode ?? settings?.defaultFitMode ?? 'fit-width',
    readingDirection: form.readingDirection ?? settings?.readingDirection ?? 'ltr',
    autoAddLibrary: form.autoAddLibrary ?? settings?.autoAddLibrary ?? true,
    readerBackground: form.readerBackground ?? settings?.readerBackground ?? '#000000',
  }

  const hasChanges = Object.keys(form).length > 0

  const saveMutation = useMutation({
    mutationFn: () => updateSettings(form),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      setForm({})
      toast({ title: 'Settings saved', description: 'Your preferences have been updated.' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save settings.', variant: 'destructive' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted))]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Customize your TorrentLeaf experience.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderDown className="h-5 w-5 text-[hsl(var(--accent))]" />
            General
          </CardTitle>
          <CardDescription>Download and library preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="download-path" className="text-sm font-medium">
              Download path
            </label>
            <Input
              id="download-path"
              value={current.downloadPath}
              onChange={(e) => setForm({ ...form, downloadPath: e.target.value })}
              placeholder="/data/torrents"
            />
            <p className="text-xs text-[hsl(var(--muted))]">
              Absolute path on the server where torrents will be downloaded.
              Must be within a mounted Docker volume.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-add to library</p>
              <p className="text-xs text-[hsl(var(--muted))]">
                Automatically add new torrents to your library.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={current.autoAddLibrary}
              aria-label="Auto-add to library"
              onClick={() => setForm({ ...form, autoAddLibrary: !current.autoAddLibrary })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                current.autoAddLibrary
                  ? 'bg-[hsl(var(--accent))]'
                  : 'bg-[hsl(var(--border))]'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  current.autoAddLibrary ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Reader defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[hsl(var(--accent))]" />
            Reader defaults
          </CardTitle>
          <CardDescription>Default settings when opening a reader.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SelectGroup
            label="Reading mode"
            value={current.defaultReadingMode}
            options={READING_MODES}
            onChange={(v) => setForm({ ...form, defaultReadingMode: v })}
          />

          <SelectGroup
            label="Fit mode"
            value={current.defaultFitMode}
            options={FIT_MODES}
            onChange={(v) => setForm({ ...form, defaultFitMode: v })}
          />

          <SelectGroup
            label="Reading direction"
            value={current.readingDirection}
            options={DIRECTIONS}
            onChange={(v) => setForm({ ...form, readingDirection: v })}
          />

          {/* Background color */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reader background</label>
            <div className="flex gap-3">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => setForm({ ...form, readerBackground: bg.value })}
                  aria-label={`Background: ${bg.label}`}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${bg.class} ${
                    current.readerBackground === bg.value
                      ? 'border-[hsl(var(--accent))] ring-2 ring-[hsl(var(--accent))]/30'
                      : 'border-[hsl(var(--border))]'
                  }`}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-[hsl(var(--accent))]" />
            Display
          </CardTitle>
          <CardDescription>Theme and appearance settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[hsl(var(--muted))]">
            Theme customization coming soon. TorrentLeaf currently uses dark mode.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
