# Data formats

All new content envelopes are versioned. Content is separate from UI code so
libraries can be replaced without changing page components.

## Vocabulary library

The existing import format remains supported:

```json
{
  "schemaVersion": 1,
  "id": "my-list",
  "title": "My TOEFL words",
  "language": "en",
  "source": "personal",
  "words": [
    {
      "id": "stable-word-id",
      "term": "ubiquitous",
      "partOfSpeech": "adjective",
      "pronunciation": "/juːˈbɪkwɪtəs/",
      "shortMeaning": "present or found everywhere",
      "exampleSentence": "Mobile devices are ubiquitous.",
      "collocations": ["ubiquitous presence"],
      "notes": "Useful for technology topics.",
      "tags": ["academic", "technology"]
    }
  ]
}
```

Unknown or malformed input is rejected before it can replace local data.
Collocations and examples are optional to remain compatible with older files.

## Interview speaking content

`src/data/toefl-data.json` retains the original array shape:

```json
[
  {
    "id": 1,
    "title": "Health and Wellness",
    "category": "Well-being & Lifestyle",
    "questions": [
      {
        "prompt": "Question text",
        "plan": "Optional preparation cue",
        "ideas": ["Idea one"],
        "collocations": ["useful phrase — meaning"],
        "answer": "First sample answer",
        "answer2": "Second sample answer"
      }
    ]
  }
]
```

The application expects four questions per current NEO set but the UI does not
hard-code that number.

## Listen & Repeat

`src/data/listen-repeat.json`:

```json
{
  "schemaVersion": 1,
  "collections": [
    {
      "id": "lecture-one",
      "title": "Lecture one",
      "description": "Short pronunciation segments",
      "sourceMedia": "assets/audio/lecture-one.mp3",
      "prompts": [
        {
          "id": "lecture-one-001",
          "collectionId": "lecture-one",
          "order": 1,
          "transcript": "The sentence the learner should repeat.",
          "audioFile": "assets/audio/lecture-one/001.mp3",
          "durationSeconds": 7.2,
          "tags": ["biology"]
        }
      ]
    }
  ]
}
```

Set `audioFile` to `null` to use the built-in speech-synthesis fallback.
Segment files should be bundled below `public/assets/audio/`.

## Academic Discussion

`src/data/academic-discussions.json`:

```json
{
  "schemaVersion": 1,
  "source": "Writing image archive",
  "taskType": "TOEFL Academic Discussion",
  "discussions": [
    {
      "id": "academic-discussion-01",
      "sequence": 1,
      "week": 1,
      "title": "Nature, nurture, and human development",
      "course": "Psychology",
      "professor": "Dr. Achebe",
      "prompt": "Professor question",
      "students": [
        { "name": "Claire", "response": "First response" },
        { "name": "Paul", "response": "Second response" }
      ],
      "recommendedWords": 100,
      "timeLimitSeconds": 600,
      "sourceImage": "Week 1 Writing Topics/1.png"
    }
  ]
}
```

Submission state is not written back into this content file. Each discussion
has a local practice record containing one live draft and up to 25 immutable
submission revisions.

## Study state

The `toefl-companion:study:v1` store contains:

```text
schemaVersion
writing[discussionId] -> draft, updatedAt, submissions[]
listenRepeatAttempts[] -> promptId, transcript, accuracy, createdAt
activities[] -> vocabulary | speaking | writing timeline items
settings -> learner name, target date, timers, autosave, sounds
```

Vocabulary and speaking repositories keep their existing versioned keys and
migrations.

## Complete backup

Backup schema version 2:

```json
{
  "schemaVersion": 2,
  "product": "toefl-companion",
  "exportedAt": "ISO-8601 timestamp",
  "speaking": {},
  "vocabulary": {},
  "study": {},
  "note": "Recording audio blobs stay on the original device."
}
```

Schema-version-1 backups are accepted. They restore speaking and vocabulary
while preserving current writing state. Audio blobs remain device-local.

