# Database Schema Patterns

Supabase/PostgreSQL schema design for hierarchical creative content.

## Table of Contents
1. [Schema Overview](#schema-overview)
2. [Core Tables](#core-tables)
3. [Cross-Reference Tables](#cross-reference-tables)
4. [TypeScript Interfaces](#typescript-interfaces)
5. [Common Queries](#common-queries)
6. [Gotchas](#gotchas)

## Schema Overview

```
worlds
  └── books (series)
        └── acts
              └── chapters
                    └── scenes
                          └── beats

characters ←──┐
locations  ←──┼── scene_* junction tables
plotlines  ←──┘
events
```

## Core Tables

### World/Universe Level

```sql
CREATE TABLE worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT,
  subtitle TEXT,
  status TEXT DEFAULT 'draft',
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Structural Hierarchy

```sql
CREATE TABLE acts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT,  -- Note: 'name' not 'title' for acts
  beat_summary TEXT,
  intention TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id UUID REFERENCES acts(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT,
  summary TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT,
  scene_summary TEXT,
  intention TEXT,
  plotline_id UUID REFERENCES plotlines(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE beats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  content TEXT,
  beat_type TEXT,  -- 'action', 'dialogue', 'description', etc.
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Cross-Reference Tables

### Characters

```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  role TEXT,  -- 'protagonist', 'antagonist', 'supporting', etc.
  arc_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for character appearances
CREATE TABLE scene_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  role_in_scene TEXT,  -- 'pov', 'present', 'mentioned'
  UNIQUE(scene_id, character_id)
);
```

### Locations

```sql
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  parent_location_id UUID REFERENCES locations(id),  -- For nested locations
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scene_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE(scene_id, location_id)
);
```

### Plotlines

```sql
CREATE TABLE plotlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,  -- Hex color for visual coding
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Events/Timeline

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_date TEXT,  -- Can be fuzzy ("Year 5", "Before the war")
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scene_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  relationship TEXT,  -- 'depicts', 'references', 'flashback_to'
  UNIQUE(scene_id, event_id)
);
```

## TypeScript Interfaces

**CRITICAL: Match these exactly to database column names!**

```typescript
interface World {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

interface Book {
  id: string
  world_id: string
  number: number
  title: string | null
  status: string
  sort_order: number
  acts?: Act[]
}

interface Act {
  id: string
  book_id: string
  number: number
  name: string | null  // NOT 'title'!
  beat_summary: string | null
  intention: string | null
  sort_order: number
  chapters?: Chapter[]
}

interface Chapter {
  id: string
  act_id: string
  number: number
  title: string | null
  summary: string | null
  sort_order: number
  scenes?: Scene[]
}

interface Scene {
  id: string
  chapter_id: string
  title: string | null
  scene_summary: string | null
  intention: string | null
  plotline_id: string | null
  plotline?: Plotline
  sort_order: number
  beats?: Beat[]
}

interface Character {
  id: string
  world_id: string
  name: string
  description: string | null
  role: string | null
  arc_summary: string | null
}

interface Plotline {
  id: string
  book_id: string
  name: string
  color: string
  description: string | null
  sort_order: number
}
```

## Common Queries

### Fetch Book with Full Hierarchy

```typescript
const { data: book } = await supabase
  .from('books')
  .select(`
    *,
    acts (
      *,
      chapters (
        *,
        scenes (
          *,
          plotline:plotlines (*),
          beats (*)
        )
      )
    )
  `)
  .eq('id', bookId)
  .order('sort_order', { foreignTable: 'acts' })
  .order('sort_order', { foreignTable: 'acts.chapters' })
  .order('sort_order', { foreignTable: 'acts.chapters.scenes' })
  .order('sort_order', { foreignTable: 'acts.chapters.scenes.beats' })
  .single()
```

### Get Characters in a Scene

```typescript
const { data: characters } = await supabase
  .from('scene_characters')
  .select(`
    role_in_scene,
    character:characters (*)
  `)
  .eq('scene_id', sceneId)
```

### Update Sort Order (Batch)

```typescript
const updates = items.map((item, index) => ({
  id: item.id,
  sort_order: index
}))

// Parallel updates
await Promise.all(
  updates.map(({ id, sort_order }) =>
    supabase.from('scenes').update({ sort_order }).eq('id', id)
  )
)
```

## Gotchas

### 1. Schema Cache

After adding columns via SQL editor, refresh PostgREST:

```sql
ALTER TABLE scenes ADD COLUMN scene_summary TEXT;
NOTIFY pgrst, 'reload schema';
```

### 2. Column Name Mismatches

If you see errors like:
```
Property 'title' does not exist on type 'Act'
```

Check that your TypeScript interface matches the actual database column name. The database might use `name` while your code uses `title`.

### 3. RLS Policies

Enable Row Level Security for user data:

```sql
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own books"
  ON books FOR SELECT
  USING (
    world_id IN (
      SELECT id FROM worlds WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can only modify their own books"
  ON books FOR ALL
  USING (
    world_id IN (
      SELECT id FROM worlds WHERE user_id = auth.uid()
    )
  );
```

### 4. Cascading Deletes

Use `ON DELETE CASCADE` for child tables to automatically clean up:

```sql
-- When an act is deleted, all its chapters, scenes, and beats are deleted too
scenes.chapter_id REFERENCES chapters(id) ON DELETE CASCADE
```

### 5. Nullable Foreign Keys

For optional relationships (like plotline assignment), use `ON DELETE SET NULL`:

```sql
scenes.plotline_id REFERENCES plotlines(id) ON DELETE SET NULL
```
