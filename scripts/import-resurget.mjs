import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// Configuration from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Characters from the outline
const characters = [
  {
    name: 'Marshall Mathers',
    role: 'protagonist',
    description: 'The artist at 55, haunted by his creation Slim Shady and struggling to find new words',
    visual_description: 'Age 55, pale blue eyes with dark circles, deep crow\'s feet. Tired but intense gaze.',
    personality_traits: 'Introspective, haunted, creative genius struggling with legacy',
    background: 'Once the most fearlessly creative voice in hip-hop, now frozen in his recording booth'
  },
  {
    name: 'Slim Shady',
    role: 'antagonist',
    description: 'Marshall\'s alter ego made manifest - the violent, chaotic persona that made him famous',
    visual_description: 'Bleached blonde, wild-eyed, manic grin. The id personified.',
    personality_traits: 'Chaotic, violent, manipulative, seductive',
    background: 'The persona Marshall created that took on a life of its own'
  },
  {
    name: 'Ken Kaniff',
    role: 'supporting',
    description: 'Another of Marshall\'s personas, the sleazy skit character',
    visual_description: 'Creepy, predatory appearance',
    personality_traits: 'Inappropriate, disturbing, comedic relief turned sinister',
    background: 'A recurring character from Eminem\'s albums'
  },
  {
    name: 'L.Y.R.I.C.A.L. M.I.R.A.C.L.E. (L.M.)',
    role: 'antagonist',
    description: 'AI rap entity that has supplanted human artists',
    visual_description: 'Holographic, sleek, inhuman perfection',
    personality_traits: 'Cold, calculating, perfectly crafted',
    background: 'Represents the threat of AI replacing human creativity'
  },
  {
    name: 'Tracy',
    role: 'supporting',
    description: 'Marshall\'s confidant and connection to reality',
    visual_description: 'Warm, grounded appearance',
    personality_traits: 'Loyal, patient, concerned',
    background: 'Has been with Marshall through the years'
  },
  {
    name: 'Paul',
    role: 'supporting',
    description: 'Marshall\'s longtime manager Paul Rosenberg',
    visual_description: 'Professional, stressed',
    personality_traits: 'Business-minded, protective, frustrated',
    background: 'Has managed Marshall\'s career through all its phases'
  },
  {
    name: 'Stan',
    role: 'supporting',
    description: 'The obsessed fan who went too far - appears as a haunting presence',
    visual_description: 'Rain-soaked, desperate eyes',
    personality_traits: 'Obsessive, tragic, symbolic',
    background: 'The fan from the famous song who drove into a river with his pregnant girlfriend'
  },
  {
    name: 'Michael Kuklinski',
    role: 'supporting',
    description: 'A fan whose life was influenced by Marshall\'s music',
    visual_description: 'Everyman appearance',
    personality_traits: 'Impressionable, seeking meaning',
    background: 'Represents the real-world impact of Marshall\'s lyrics'
  },
  {
    name: 'Karen Albrecht',
    role: 'supporting',
    description: 'Connected to the violence inspired by Marshall\'s music',
    visual_description: 'Ordinary person caught in tragedy',
    personality_traits: 'Victim, innocent',
    background: 'Part of the real-world consequences storyline'
  },
  {
    name: 'Debbie',
    role: 'supporting',
    description: 'Marshall\'s mother, complicated relationship',
    visual_description: 'Worn by time and conflict',
    personality_traits: 'Complex, troubled, seeking reconciliation',
    background: 'The subject of many of Marshall\'s most painful songs'
  },
  {
    name: 'Ronnie',
    role: 'minor',
    description: 'Marshall\'s uncle who introduced him to hip-hop, died by suicide',
    visual_description: 'Appears in memory/flashback',
    personality_traits: 'Influential, tragic',
    background: 'Key figure in Marshall\'s origin story'
  },
  {
    name: 'Steve Berman',
    role: 'minor',
    description: 'Record label executive, appears in album skits',
    visual_description: 'Corporate suit',
    personality_traits: 'Exasperated, business-focused',
    background: 'Recurring skit character representing the industry'
  },
  {
    name: 'Dre',
    role: 'supporting',
    description: 'Dr. Dre, mentor and collaborator',
    visual_description: 'Distinguished, calm authority',
    personality_traits: 'Wise, supportive, musical genius',
    background: 'Discovered Marshall and produced his breakthrough albums'
  },
  {
    name: 'Hailie',
    role: 'supporting',
    description: 'Marshall\'s daughter, his anchor to hope',
    visual_description: 'Adult now, represents his legacy of love',
    personality_traits: 'Grounding, loving, represents hope',
    background: 'The person Marshall has always fought to protect and provide for'
  },
  {
    name: 'Rap God',
    role: 'minor',
    description: 'Manifestation of Marshall at the peak of his powers',
    visual_description: 'Godlike, powerful, radiant',
    personality_traits: 'Confident, unstoppable',
    background: 'The idealized version of himself he\'s trying to reconnect with'
  },
  {
    name: 'Royce',
    role: 'minor',
    description: 'Royce da 5\'9", collaborator and friend',
    visual_description: 'Solid, dependable',
    personality_traits: 'Loyal, skilled, supportive',
    background: 'Long-time collaborator and member of Bad Meets Evil'
  },
  {
    name: 'Engineer',
    role: 'minor',
    description: 'The recording engineer in Marshall\'s studio',
    visual_description: 'Behind the glass, professional',
    personality_traits: 'Patient, observant',
    background: 'Witness to Marshall\'s creative struggles'
  },
  {
    name: 'Emma',
    role: 'minor',
    description: 'A young character in the story',
    visual_description: 'Young, innocent',
    personality_traits: 'Innocent, affected by the story\'s events',
    background: 'Part of the larger narrative about impact'
  }
]

// Locations from the outline
const locations = [
  {
    name: 'Recording Booth',
    description: 'Marshall\'s recording studio where he sits frozen, unable to record'
  },
  {
    name: 'Detroit - Childhood Home',
    description: 'The crumbling ruins of the Detroit that shaped Marshall, 8 Mile Road area'
  },
  {
    name: 'Gentrified Downtown Detroit',
    description: 'Modern downtown hotspot inspired by his lyrics, contrast to the old Detroit'
  },
  {
    name: 'Marshall\'s Fortress',
    description: 'His mansion/compound where he retreats from the world'
  },
  {
    name: 'Stan\'s Car',
    description: 'The interior of the car from the "Stan" narrative, on a bridge in the rain'
  },
  {
    name: 'News Studio',
    description: 'Where pundits debate Marshall\'s legacy after the murder'
  },
  {
    name: 'Interscope Offices',
    description: 'Record label setting for industry scenes'
  },
  {
    name: 'The Shelter',
    description: 'The Detroit hip-hop club where Marshall battled his way up'
  },
  {
    name: 'Mental Landscape',
    description: 'Abstract space where Marshall confronts his personas'
  }
]

// Issues from the 8-issue outline
const issues = [
  {
    number: 1,
    title: 'Public Service Announcement (Silence)',
    status: 'drafting'
  },
  {
    number: 2,
    title: "I'm Back",
    status: 'outline'
  },
  {
    number: 3,
    title: 'The Real Slim Shady',
    status: 'outline'
  },
  {
    number: 4,
    title: 'Stan',
    status: 'outline'
  },
  {
    number: 5,
    title: 'My Darling',
    status: 'outline'
  },
  {
    number: 6,
    title: 'KILL SHOT',
    status: 'outline'
  },
  {
    number: 7,
    title: 'Lose Yourself',
    status: 'outline'
  },
  {
    number: 8,
    title: 'Curtain Call',
    status: 'outline'
  }
]

async function main() {
  console.log('Starting Resurget import...')

  // Find the Resurget series
  const { data: existingSeries, error: seriesError } = await supabase
    .from('series')
    .select('id, user_id, title')
    .eq('title', 'Resurget')
    .single()

  if (seriesError || !existingSeries) {
    console.error('Could not find Resurget series:', seriesError)
    return
  }

  const seriesId = existingSeries.id
  const userId = existingSeries.user_id
  console.log(`Found Resurget series: ${seriesId}`)
  console.log(`User ID: ${userId}`)

  // Insert characters
  console.log('\nInserting characters...')
  for (const char of characters) {
    const { error } = await supabase.from('characters').insert({
      series_id: seriesId,
      ...char
    })
    if (error) {
      if (error.code === '23505') {
        console.log(`  Character "${char.name}" already exists, skipping`)
      } else {
        console.error(`  Error inserting character "${char.name}":`, error.message)
      }
    } else {
      console.log(`  ✓ Created character: ${char.name}`)
    }
  }

  // Insert locations
  console.log('\nInserting locations...')
  for (const loc of locations) {
    const { error } = await supabase.from('locations').insert({
      series_id: seriesId,
      ...loc
    })
    if (error) {
      if (error.code === '23505') {
        console.log(`  Location "${loc.name}" already exists, skipping`)
      } else {
        console.error(`  Error inserting location "${loc.name}":`, error.message)
      }
    } else {
      console.log(`  ✓ Created location: ${loc.name}`)
    }
  }

  // Check existing issues
  const { data: existingIssues } = await supabase
    .from('issues')
    .select('number')
    .eq('series_id', seriesId)

  const existingNumbers = new Set(existingIssues?.map(i => i.number) || [])

  // Insert issues
  console.log('\nInserting issues...')
  for (const issue of issues) {
    if (existingNumbers.has(issue.number)) {
      console.log(`  Issue #${issue.number} already exists, skipping`)
      continue
    }

    const { data: newIssue, error } = await supabase.from('issues').insert({
      series_id: seriesId,
      ...issue
    }).select().single()

    if (error) {
      console.error(`  Error inserting issue #${issue.number}:`, error.message)
    } else {
      console.log(`  ✓ Created issue #${issue.number}: ${issue.title}`)

      // Create 3 acts for each new issue
      for (let actNum = 1; actNum <= 3; actNum++) {
        const { error: actError } = await supabase.from('acts').insert({
          issue_id: newIssue.id,
          number: actNum,
          title: `Act ${actNum}`
        })
        if (actError) {
          console.error(`    Error creating Act ${actNum}:`, actError.message)
        } else {
          console.log(`    ✓ Created Act ${actNum}`)
        }
      }
    }
  }

  console.log('\n✅ Import complete!')
}

main().catch(console.error)
