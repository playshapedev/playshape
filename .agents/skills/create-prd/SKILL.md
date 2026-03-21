---
name: create-prd
description: Create a structured PRD (Product Requirements Document) with testable requirements and progress tracking. Use when user wants to create a PRD, define feature requirements, or plan a new feature with verifiable acceptance criteria.
metadata:
  author: Playshape
  version: "1.0.0"
  source: Internal skill for plan-driven development
---

This skill will be invoked when the user wants to create a PRD with testable requirements. You may skip steps if you don't consider them necessary.

## Output Format

The PRD will be stored as a JSON file with the following structure:

```json
{
  "feature": "exporting-feature",
  "createdAt": "2026-03-21T10:00:00Z",
  "requirements": [
    {
      "id": "req-001",
      "category": "functional",
      "description": "New chat button creates a fresh conversation",
      "steps": [
        "Navigate to main interface",
        "Click the 'New Chat' button",
        "Verify a new conversation is created",
        "Check that chat area shows welcome state",
        "Verify conversation appears in sidebar"
      ],
      "passes": false
    }
  ]
}
```

**Categories:**
- `functional` - Core feature behavior and user interactions
- `technical` - Implementation details, architecture, data models
- `ui` - User interface components, styling, layout
- `integration` - Third-party services, APIs, external dependencies
- `performance` - Speed, efficiency, resource usage requirements
- `security` - Authentication, authorization, data protection
- `testing` - Test coverage, quality assurance

**Steps:** Each requirement must have 3-7 concrete, verifiable steps that can be tested.

**Passes:** Always set to `false` initially. Updated as work progresses.

## Workflow

1. **Ask the user** for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

2. **Explore the repo** to verify their assertions and understand the current state of the codebase.

3. **Interview the user relentlessly** about every aspect of this plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

4. **Sketch out the major modules** you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

   A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

   Check with the user that these modules match their expectations. Check with the user which modules they want tests written for.

5. **Create the PRD directory and files** under `.plan/`:
   - Create `.plan/{feature-name}/` directory
   - Create `prd.json` with the structured requirements
   - Create `progress.txt` (initially empty, for manual notes)

## File Structure

```
.plan/
└── {feature-name}/
    ├── prd.json      # Structured requirements with testable steps
    └── progress.txt  # Manual progress notes and context
```

## Example prd.json

```json
{
  "feature": "user-authentication",
  "createdAt": "2026-03-21T10:00:00Z",
  "requirements": [
    {
      "id": "auth-001",
      "category": "functional",
      "description": "User can log in with email and password",
      "steps": [
        "Navigate to login page",
        "Enter valid email address",
        "Enter correct password",
        "Click login button",
        "Verify successful authentication",
        "Check that user is redirected to dashboard",
        "Verify JWT token is stored securely"
      ],
      "passes": false
    },
    {
      "id": "auth-002",
      "category": "functional",
      "description": "Invalid credentials show error message",
      "steps": [
        "Navigate to login page",
        "Enter invalid email or password",
        "Click login button",
        "Verify error message is displayed",
        "Check that user remains on login page",
        "Verify no token is created"
      ],
      "passes": false
    },
    {
      "id": "auth-003",
      "category": "security",
      "description": "Passwords are hashed and never stored in plain text",
      "steps": [
        "Review user database schema",
        "Verify password field stores bcrypt hash",
        "Check that plain text passwords are never logged",
        "Verify password comparison uses bcrypt compare function"
      ],
      "passes": false
    }
  ]
}
```

## Usage with ralph.sh

Once the PRD is created, use the ralph.sh script to execute it:

```bash
./scripts/ralph.sh 10
```

This will iterate through the requirements, working on one at a time, checking feedback loops (types/tests), updating progress.txt, and committing changes.

## Tips

- Each requirement should be independent and testable in isolation
- Steps should be concrete actions that can be verified
- Include edge cases and error scenarios as separate requirements
- Technical requirements should reference specific architectural decisions
- Update `passes` to `true` as requirements are completed
- Use `progress.txt` for notes about blockers, decisions, or context that doesn't fit in the structured format
