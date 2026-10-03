# ralph.sh
# Usage: ./scripts/ralph.sh <prd-name> [iterations]
# 
# Executes a PRD (Product Requirements Document) by working through
# its requirements iteratively. The PRD must be in .plan/<prd-name>/prd.json

set -e

# Check for PRD name argument
if [ -z "$1" ]; then
  echo "Usage: $0 <prd-name> [iterations]"
  echo ""
  echo "Arguments:"
  echo "  prd-name      Name of the PRD directory in .plan/ (e.g., 'exporting-feature')"
  echo "  iterations    Number of iterations to run (default: 10)"
  echo ""
  echo "Examples:"
  echo "  $0 exporting-feature"
  echo "  $0 user-authentication 20"
  exit 1
fi

PRD_NAME="$1"
ITERATIONS="${2:-10}"
PRD_DIR=".plan/${PRD_NAME}"
PRD_FILE="${PRD_DIR}/prd.json"
PROGRESS_FILE="${PRD_DIR}/progress.txt"

# Verify the PRD exists
if [ ! -d "$PRD_DIR" ]; then
  echo "Error: PRD directory not found: ${PRD_DIR}"
  echo "Run 'opencode run /create-prd' first to create a PRD."
  exit 1
fi

if [ ! -f "$PRD_FILE" ]; then
  echo "Error: PRD file not found: ${PRD_FILE}"
  exit 1
fi

echo "Executing PRD: ${PRD_NAME}"
echo "PRD file: ${PRD_FILE}"
echo "Progress file: ${PROGRESS_FILE}"
echo "Iterations: ${ITERATIONS}"
echo ""

# Ensure progress file exists
touch "$PROGRESS_FILE"

# For each iteration, run OpenCode to work through the PRD
for ((i=1; i<=$ITERATIONS; i++)); do
  echo "========================================"
  echo "Iteration $i of $ITERATIONS"
  echo "========================================"
  
  result=$(opencode run \
"@${PRD_FILE} @${PROGRESS_FILE}

You are executing a PRD (Product Requirements Document). 

The PRD is a JSON file with structured requirements. Each requirement has:
- id: unique identifier
- category: functional, technical, ui, integration, performance, security, or testing
- description: what needs to be implemented
- steps: 3-7 concrete, verifiable steps to complete the requirement
- passes: boolean (false = not yet complete, true = complete)

Your task:
1. Read the PRD file and understand the current state
2. Read the progress.txt file for any context about work already done
3. Find the first requirement where passes=false
4. Work on ONLY that single requirement until it's complete
5. Check feedback loops (run type checks, tests, lint) as you work
6. When you've completed the requirement, update its 'passes' field to true in the PRD JSON
7. Append a brief progress note to progress.txt (what you did, any blockers)
8. Make a git commit with a descriptive message

IMPORTANT: Only work on ONE requirement per iteration. If you notice all requirements are complete, output <promise>COMPLETE</promise>.

If you encounter errors or blockers that prevent completion, note them in progress.txt but do NOT mark the requirement as passed.
")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "========================================"
    echo "PRD complete! All requirements passed."
    echo "========================================"
    exit 0
  fi
  
  echo ""
done

echo ""
echo "========================================"
echo "Reached maximum iterations ($ITERATIONS)."
echo "Run again with more iterations if needed."
echo "========================================"
