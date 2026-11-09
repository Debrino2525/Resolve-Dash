/**
 * Syntax-level validation of the PL/pgSQL test file.
 *
 * Checks that no EXCEPTION block has its outer BEGIN/END pair terminated with
 * END IF; instead of END;  An inner IF/END IF inside the EXCEPTION handler is
 * perfectly legal — the validator must track IF nesting depth so it only
 * reports END IF; that closes the BEGIN/EXCEPTION block itself.
 *
 * This is static text analysis only — it does not execute SQL.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SQL_PATH = join(process.cwd(), 'test', 'db-security-and-constraints.sql');
const src = readFileSync(SQL_PATH, 'utf-8');
const lines = src.split('\n');

const errors: string[] = [];

// ---------------------------------------------------------------------------
// Rule 1: Track BEGIN/EXCEPTION blocks.  Within each such block, count
// IF/END IF pairs.  An END IF; that reduces ifDepth to -1 would mean it is
// closing the EXCEPTION block itself — that is the bug.  END; (bare) closes
// the EXCEPTION block correctly.
// ---------------------------------------------------------------------------
let inExceptionBlock  = false;
let exceptionOpenLine = -1;
let ifDepthInBlock    = 0;

for (let i = 0; i < lines.length; i++) {
  // Strip inline comments and trailing whitespace, uppercase for matching
  const raw   = lines[i].replace(/--.*$/, '').trim();
  const upper = raw.toUpperCase();

  if (!inExceptionBlock) {
    // Entering an EXCEPTION handler (the EXCEPTION keyword that follows BEGIN)
    if (/^EXCEPTION\b/.test(upper)) {
      inExceptionBlock  = true;
      exceptionOpenLine = i + 1;  // 1-based line number
      ifDepthInBlock    = 0;
    }
  } else {
    // Track nested IF statements inside the exception handler
    // Match: IF <condition> THEN  (statement-level, not function-level)
    if (/^IF\b/.test(upper) && /\bTHEN\b/.test(upper)) {
      ifDepthInBlock++;
    }

    // END IF; closes the innermost IF
    if (/^END\s+IF\s*;/.test(upper)) {
      if (ifDepthInBlock > 0) {
        ifDepthInBlock--;   // closes a nested IF inside the handler — OK
      } else {
        // No open IF to close: this END IF; is trying to close the EXCEPTION block
        errors.push(
          `Line ${i + 1}: END IF; closes the EXCEPTION block opened at line ${exceptionOpenLine}. ` +
          `Use END; to close a BEGIN/EXCEPTION block.`
        );
        inExceptionBlock = false;
      }
    }

    // A bare END; closes the EXCEPTION block
    if (/^END\s*;$/.test(upper)) {
      inExceptionBlock = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 2: BEGIN / END balance for the outer DO $$ block only.
// We track whether we are inside the DO $$ body by counting $$ delimiters
// sequentially. The key ordering rule:
//   - On lines that OPEN the body (DO $$): toggle AFTER checking BEGIN/END
//     (the BEGIN is on a later line anyway, but we toggle after to be safe)
//   - On lines that CLOSE the body (END $$;): check BEGIN/END BEFORE toggling,
//     so the closing END $$ is counted while still inside the body.
// Simplest correct approach: check BEGIN/END using the state BEFORE the toggle
// on the current line, then apply toggles.
// ---------------------------------------------------------------------------
let inDoBody    = false;
let beginDepth  = 0;
let beginLines: number[] = [];

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i].replace(/--.*$/, ''); // strip inline comments
  const stripped = rawLine.trim().toUpperCase();
  const dollarCount = (rawLine.match(/\$\$/g) || []).length;

  // Evaluate BEGIN/END using inDoBody BEFORE applying the current line's toggles,
  // except when the line opens the body (dollarCount > 0 AND inDoBody was false):
  // in that case the content is NOT yet in the body, so we skip.
  // For lines that contain the closing $$ (inDoBody was true), we DO evaluate.
  const bodyForThisLine = inDoBody; // snapshot before toggles

  // Apply toggles
  if (dollarCount % 2 === 1) {
    inDoBody = !inDoBody;
  }

  if (bodyForThisLine) {
    // BEGIN starts a block (not the transaction-level standalone BEGIN;)
    if (/^BEGIN$/.test(stripped) || /^BEGIN\s+[^;]/.test(stripped)) {
      beginLines.push(i + 1);
      beginDepth++;
    }
    // END; or END $$ closes the innermost open block
    if (/^END\s*;$/.test(stripped) || /^END\s+\$\$/.test(stripped)) {
      if (beginLines.length > 0) {
        beginLines.pop();
        beginDepth--;
      }
    }
  }
}

if (beginDepth !== 0) {
  errors.push(
    `Unbalanced BEGIN/END inside DO body. Net unclosed depth: ${beginDepth}. ` +
    `Unclosed BEGIN lines: ${beginLines.join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length === 0) {
  console.log(
    '✅  SQL syntax validation PASSED:\n' +
    '    • No END IF; found closing a BEGIN/EXCEPTION block\n' +
    '    • BEGIN/END blocks are balanced'
  );
} else {
  console.error('❌  SQL syntax validation FAILED:');
  errors.forEach(e => console.error('   ', e));
  process.exit(1);
}
