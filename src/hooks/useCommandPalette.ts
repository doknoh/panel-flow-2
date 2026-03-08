'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface CommandPaletteResult {
  type: 'issue' | 'character' | 'location' | 'plotline' | 'action'
  id: string
  label: string
  sublabel?: string
  href?: string
}

interface CachedEntities {
  issues: CommandPaletteResult[]
  characters: CommandPaletteResult[]
  locations: CommandPaletteResult[]
  plotlines: CommandPaletteResult[]
  fetchedAt: number
}

const CACHE_TTL = 30_000 // 30 seconds

function fuzzyScore(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Exact match gets highest score
  if (lowerText === lowerQuery) return 100

  // Starts-with gets high score
  if (lowerText.startsWith(lowerQuery)) return 90

  // Contains as substring
  const substringIndex = lowerText.indexOf(lowerQuery)
  if (substringIndex >= 0) return 80 - substringIndex

  // Fuzzy match - score by how tight the character grouping is
  let qi = 0
  let lastMatchIndex = -1
  let totalGap = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      if (lastMatchIndex >= 0) {
        totalGap += ti - lastMatchIndex - 1
      }
      lastMatchIndex = ti
      qi++
    }
  }
  if (qi === lowerQuery.length) {
    return Math.max(10, 60 - totalGap * 5)
  }

  return 0
}

export function useCommandPalette(seriesId: string) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [results, setResults] = useState<CommandPaletteResult[]>([])
  const cacheRef = useRef<CachedEntities | null>(null)
  const fetchingRef = useRef(false)

  // Built-in actions (memoized to avoid dependency churn)
  const builtInActions: CommandPaletteResult[] = useMemo(() => [
    {
      type: 'action',
      id: 'new-issue',
      label: 'New Issue',
      sublabel: 'Create a new issue in this series',
      href: `/series/${seriesId}`,
    },
    {
      type: 'action',
      id: 'new-character',
      label: 'New Character',
      sublabel: 'Add a character to this series',
      href: `/series/${seriesId}/characters`,
    },
    {
      type: 'action',
      id: 'new-location',
      label: 'New Location',
      sublabel: 'Add a location to this series',
      href: `/series/${seriesId}/locations`,
    },
    {
      type: 'action',
      id: 'open-guided-mode',
      label: 'Open Guided Mode',
      sublabel: 'AI-driven story exploration',
      href: `/series/${seriesId}/guide`,
    },
    {
      type: 'action',
      id: 'open-canvas',
      label: 'Open Canvas',
      sublabel: 'Visual brainstorming space',
      href: `/series/${seriesId}/canvas`,
    },
    {
      type: 'action',
      id: 'toggle-theme',
      label: 'Toggle Theme',
      sublabel: 'Switch between light and dark mode',
    },
  ], [seriesId])

  // Fetch entities from Supabase with caching
  const fetchEntities = useCallback(async () => {
    const now = Date.now()
    if (
      cacheRef.current &&
      now - cacheRef.current.fetchedAt < CACHE_TTL
    ) {
      return cacheRef.current
    }

    if (fetchingRef.current) return cacheRef.current
    fetchingRef.current = true

    const supabase = createClient()

    const [issuesRes, charactersRes, locationsRes, plotlinesRes] = await Promise.all([
      supabase
        .from('issues')
        .select('id, number, title, status')
        .eq('series_id', seriesId)
        .order('number'),
      supabase
        .from('characters')
        .select('id, name, role')
        .eq('series_id', seriesId)
        .order('name'),
      supabase
        .from('locations')
        .select('id, name, description')
        .eq('series_id', seriesId)
        .order('name'),
      supabase
        .from('plotlines')
        .select('id, name, color, description')
        .eq('series_id', seriesId)
        .order('sort_order'),
    ])

    const issues: CommandPaletteResult[] = (issuesRes.data || []).map((issue) => ({
      type: 'issue' as const,
      id: issue.id,
      label: `Issue #${issue.number}${issue.title ? `: ${issue.title}` : ''}`,
      sublabel: issue.status,
      href: `/series/${seriesId}/issues/${issue.id}`,
    }))

    const characters: CommandPaletteResult[] = (charactersRes.data || []).map((char) => ({
      type: 'character' as const,
      id: char.id,
      label: char.name,
      sublabel: char.role || undefined,
      href: `/series/${seriesId}/characters?selected=${char.id}`,
    }))

    const locations: CommandPaletteResult[] = (locationsRes.data || []).map((loc) => ({
      type: 'location' as const,
      id: loc.id,
      label: loc.name,
      sublabel: loc.description
        ? loc.description.length > 60
          ? loc.description.slice(0, 60) + '...'
          : loc.description
        : undefined,
      href: `/series/${seriesId}/locations?selected=${loc.id}`,
    }))

    const plotlines: CommandPaletteResult[] = (plotlinesRes.data || []).map((pl) => ({
      type: 'plotline' as const,
      id: pl.id,
      label: pl.name,
      sublabel: pl.description
        ? pl.description.length > 60
          ? pl.description.slice(0, 60) + '...'
          : pl.description
        : undefined,
      href: `/series/${seriesId}/plotlines`,
    }))

    const cached: CachedEntities = {
      issues,
      characters,
      locations,
      plotlines,
      fetchedAt: Date.now(),
    }
    cacheRef.current = cached
    fetchingRef.current = false
    return cached
  }, [seriesId])

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (!prev) {
            // Opening: reset state
            setQuery('')
            setSelectedIndex(0)
            setResults([])
          }
          return !prev
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fetch entities when palette opens and compute results when query changes
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const computeResults = async () => {
      const entities = await fetchEntities()
      if (cancelled || !entities) return

      const allItems: CommandPaletteResult[] = [
        ...entities.issues,
        ...entities.characters,
        ...entities.locations,
        ...entities.plotlines,
        ...builtInActions,
      ]

      if (!query.trim()) {
        // No query: show actions first, then a sample of entities
        const defaultResults = [
          ...builtInActions,
          ...entities.issues.slice(0, 5),
          ...entities.characters.slice(0, 3),
          ...entities.locations.slice(0, 3),
        ]
        setResults(defaultResults)
        setSelectedIndex(0)
        return
      }

      // Filter and sort by fuzzy match score
      const scored = allItems
        .map((item) => {
          const labelScore = fuzzyScore(item.label, query)
          const sublabelScore = item.sublabel ? fuzzyScore(item.sublabel, query) : 0
          const score = Math.max(labelScore, sublabelScore * 0.8)
          return { item, score }
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)

      setResults(scored.map(({ item }) => item))
      setSelectedIndex(0)
    }

    computeResults()

    return () => {
      cancelled = true
    }
  }, [isOpen, query, fetchEntities, builtInActions])

  return {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
  }
}
