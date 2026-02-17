## CourseAPI — Learner Progress Tracking

Every activity has access to `window.CourseAPI` — a global API for reporting learner progress, recording interactions, and persisting state. **Every activity MUST call `CourseAPI.complete()` or `CourseAPI.fail()` at some point.** For non-interactive content pages, call `CourseAPI.complete()` immediately on mount. The CourseAPI is always available — you do not need to check for its existence.

### Lifecycle

Activities do NOT need to call `initialize()` or `terminate()` — the course interface handles the session lifecycle. Just call `complete()` or `fail()` when the activity is done.

### Completion (REQUIRED)

```js
// Simple content page — complete immediately
CourseAPI.complete()

// Quiz with a score (0–1)
CourseAPI.complete({ score: 0.85 })

// Learner failed (e.g. below passing threshold)
CourseAPI.fail({ score: 0.3 })
```

### Progress

```js
// Report progress as 0–1 (e.g. 3 of 10 questions = 0.3)
CourseAPI.setProgress(0.3)
```

### Bookmarking & State Persistence

```js
// Save a bookmark (e.g. current question index)
CourseAPI.setLocation('question-5')
const loc = CourseAPI.getLocation() // 'question-5' or null

// Save arbitrary state for resume (JSON-serializable)
CourseAPI.suspend({ currentStep: 3, answers: { q1: 'B', q2: 'A' } })

// Restore on next load
const saved = CourseAPI.restore()
if (saved) {
  // Resume from saved.currentStep
}
```

### Recording Interactions (Statements)

Use `CourseAPI.record()` to log learner interactions. Each statement has a verb, object, and optional result:

```js
// Quiz question answered correctly
CourseAPI.record({
  verb: 'answered',
  object: { id: 'q1', name: 'What does CPR stand for?', type: 'question' },
  result: { response: 'Cardiopulmonary Resuscitation', correct: true, score: 1, duration: 12 }
})

// Branching scenario choice
CourseAPI.record({
  verb: 'chose',
  object: { id: 'branch-1', name: 'How do you respond?', type: 'branch' },
  result: { response: 'Apologize and offer refund', correct: true, duration: 8 }
})

// Content viewed (no right/wrong)
CourseAPI.record({
  verb: 'experienced',
  object: { id: 'intro-video', name: 'Introduction', type: 'video' }
})
```

**Available verbs:** `answered`, `chose`, `attempted`, `experienced`, `matched`, `sequenced`, `rated`, `commented` (or any custom string).

**Result fields** (all optional): `response` (string), `correct` (boolean), `score` (0–1), `duration` (seconds), `extensions` (object).

### Complete Example (Quiz Activity)

```js
// In <script setup>
onMounted(() => {
  // Restore previous state if resuming
  const saved = CourseAPI.restore()
  if (saved) {
    currentQuestion.value = saved.currentQuestion
    answers.value = saved.answers
  }
})

function submitAnswer(questionId, answer, isCorrect) {
  CourseAPI.record({
    verb: 'answered',
    object: { id: questionId, name: questions[questionId].text, type: 'question' },
    result: { response: answer, correct: isCorrect, score: isCorrect ? 1 : 0 }
  })

  // Update progress
  CourseAPI.setProgress(answeredCount.value / totalQuestions.value)

  // Save state for resume
  CourseAPI.suspend({ currentQuestion: currentQuestion.value, answers: answers.value })
}

function finishQuiz() {
  const score = correctCount.value / totalQuestions.value
  if (score >= 0.7) {
    CourseAPI.complete({ score })
  } else {
    CourseAPI.fail({ score })
  }
}
```

### Complete Example (Simple Content Page)

```js
onMounted(() => {
  CourseAPI.complete() // No interaction required — immediately complete
})
```

### Notes

- In the preview, CourseAPI logs all calls to the browser console with styled output — open DevTools to see what the activity is reporting.
- `suspend()` and `restore()` persist across preview refreshes via localStorage.
- Statements are flushed automatically every 20 seconds. `complete()` and `fail()` trigger an immediate flush.
- When this activity is exported as a SCORM or xAPI package, the same CourseAPI calls will be translated to the appropriate standard automatically — no code changes needed.
